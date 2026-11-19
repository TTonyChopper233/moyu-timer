const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const zlib = require('zlib');

const PAGE = path.join(__dirname, 'index.html');
// 打包后 tray.png 会解包到 app.asar.unpacked，保证 nativeImage 读到真实文件；开发模式仍是项目根目录
const ICON = path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'tray.png');

let widgetWin = null;
let fullWin = null;
let tray = null;
let quitting = false;
let currentTheme = null;   // 由渲染进程上报；窗口互斥切换时通过 query 传给新窗口

const WIDGET_W = 240;
const WIDGET_H = 180;
const VALID_THEMES = ['abyss', 'sunny', 'bikini', 'rick'];

// ---- 极简 PNG 生成（仅在图标文件缺失时作兜底，纯代码无外链） ----
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function solidPng(w, h, R, G, B) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * stride + 1 + x * 4;
      raw[o] = R; raw[o + 1] = G; raw[o + 2] = B; raw[o + 3] = 255;
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function appIcon() {
  const img = nativeImage.createFromPath(ICON);
  if (!img.isEmpty()) return img;
  return nativeImage.createFromBuffer(solidPng(16, 16, 18, 135, 200));
}

function loadPage(win, widget) {
  const query = {};
  if (widget) query.widget = '1';
  if (currentTheme) query.theme = currentTheme;
  win.loadFile(PAGE, { query });
}

// 小窗固定在当前窗口所属显示器的右下角，按工作区避开任务栏
function widgetPosition() {
  let display = screen.getPrimaryDisplay();
  if (fullWin && !fullWin.isDestroyed()) {
    display = screen.getDisplayMatching(fullWin.getBounds()) || display;
  }
  const area = display.workArea || display.bounds;
  const margin = 16;
  return {
    x: Math.max(area.x, area.x + area.width - WIDGET_W - margin),
    y: Math.max(area.y, area.y + area.height - WIDGET_H - margin)
  };
}

// 完整版与小窗互斥：同一时刻只保留一个窗口
function closeWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.close();
  widgetWin = null;
}
function closeFull() {
  if (fullWin && !fullWin.isDestroyed()) fullWin.close();
  fullWin = null;
}

function createWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) { widgetWin.focus(); return; }
  const pos = widgetPosition();
  closeFull();
  widgetWin = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: WIDGET_W,
    height: WIDGET_H,
    frame: false,
    transparent: true,
    opacity: 0.9,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,   // 关掉原生矩形阴影——它在 Windows 下不跟随 CSS 圆角
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  loadPage(widgetWin, true);
  widgetWin.on('closed', () => { widgetWin = null; });
}

function createFull() {
  if (fullWin && !fullWin.isDestroyed()) {
    if (fullWin.isMinimized()) fullWin.restore();
    fullWin.focus();
    return;
  }
  closeWidget();
  fullWin = new BrowserWindow({
    width: 780,
    height: 1000,
    minWidth: 420,
    title: '摸鱼计时器',
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  loadPage(fullWin, false);
  fullWin.on('closed', () => { fullWin = null; });
}

ipcMain.on('widget:expand', createFull);   // 小窗点展开：关小窗、开完整版
ipcMain.on('full:collapse', createWidget); // 完整版点小窗：关完整版、开小窗
ipcMain.on('widget:close', closeWidget);
ipcMain.on('theme:set', (_event, id) => {
  if (VALID_THEMES.includes(id)) currentTheme = id;
});

// 任一窗口修改了持久状态，广播给其它窗口，保证小窗与完整版实时同步
ipcMain.on('state:changed', (event, payload) => {
  [widgetWin, fullWin].forEach(win => {
    if (win && win.webContents !== event.sender && !win.isDestroyed()) {
      win.webContents.send('state:changed', payload);
    }
  });
});

function createTray() {
  tray = new Tray(appIcon());
  tray.setToolTip('摸鱼计时器');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌面小窗', click: createWidget },
    { label: '展开完整版', click: createFull },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', createWidget);
}

// 单实例：重复双击只把已有窗口唤到前台，不会开出第二份托盘
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  quitting = true;
  app.quit();
} else {
  app.on('second-instance', () => {
    if (widgetWin && !widgetWin.isDestroyed()) { widgetWin.show(); widgetWin.focus(); return; }
    if (fullWin && !fullWin.isDestroyed()) { fullWin.show(); fullWin.focus(); return; }
    createWidget();
  });

  app.whenReady().then(() => {
    createWidget();
    createTray();
  });
}

// 关闭所有窗口不退出，托盘常驻；退出只由托盘菜单触发
app.on('window-all-closed', (e) => {
  e.preventDefault();
  if (quitting) app.quit();
});
