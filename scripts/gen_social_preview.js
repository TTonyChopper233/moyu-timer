const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 640,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#062f43',
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });

  const source = path.join(ROOT, 'docs', 'social', 'github-social-preview.html');
  const output = path.join(ROOT, 'docs', 'social', 'github-social-preview.png');
  await win.loadFile(source);
  await win.webContents.executeJavaScript(`
    (async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(img => img.complete ? img.decode().catch(() => {}) : new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })));
      return { width: innerWidth, height: innerHeight, images: document.images.length };
    })()
  `);
  await new Promise(resolve => setTimeout(resolve, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 640 });
  fs.writeFileSync(output, image.toPNG());
  console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, size: image.getSize() }));
  win.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
