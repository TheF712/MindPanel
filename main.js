const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const fs = require('fs');
const os = require('os');

let mainWindow;
let assistantWindow;
let screenshotOverlay;
let screenshotMode = false;
let captureArea = { x: 100, y: 100, width: 400, height: 300 };
let displayInfo = null;

function getAssetPath(filename) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', filename);
  } else {
    return path.join(__dirname, filename);
  }
}

function getValidAssetPath(filename) {
  const assetPath = getAssetPath(filename);
  console.log(`Buscando archivo: ${filename}`);
  console.log(`Ruta calculada: ${assetPath}`);
  console.log(`¿Archivo existe?: ${fs.existsSync(assetPath)}`);
  
  if (!fs.existsSync(assetPath)) {
    console.error(`Archivo no encontrado: ${assetPath}`);
    const alternatives = [
      path.join(__dirname, filename),
      path.join(process.cwd(), filename),
      path.join(app.getAppPath(), filename)
    ];
    
    for (const alt of alternatives) {
      console.log(`Probando ruta alternativa: ${alt}`);
      if (fs.existsSync(alt)) {
        console.log(`¡Archivo encontrado en ruta alternativa!: ${alt}`);
        return alt;
      }
    }
    
    throw new Error(`No se pudo encontrar el archivo: ${filename}`);
  }
  
  return assetPath;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 475,
    height: 300,
    frame: false,
    show: false,
    skipTaskbar: true, // Ocultar de la taskbar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    resizable: false,
    movable: true,
    // Configuraciones adicionales para Windows 11
    titleBarStyle: 'hidden',
    titleBarOverlay: false
  });
  
  try {
    const htmlPath = getValidAssetPath('index.html');
    console.log('Cargando ventana principal desde:', htmlPath);
    mainWindow.loadFile(htmlPath);
  } catch (error) {
    console.error('Error cargando index.html:', error);
    mainWindow.loadURL('data:text/html,<h1>Error: No se pudo cargar index.html</h1>');
  }

  // Ocultar de la taskbar cuando se minimiza o pierde el foco
  mainWindow.on('minimize', () => {
    mainWindow.setSkipTaskbar(true);
  });

  mainWindow.on('blur', () => {
    mainWindow.setSkipTaskbar(true);
  });

  mainWindow.on('focus', () => {
    mainWindow.setSkipTaskbar(true);
  });

  mainWindow.on('closed', () => {
    if (assistantWindow) {
      assistantWindow.close();
      assistantWindow = null;
    }
    if (screenshotOverlay) {
      screenshotOverlay.close();
      screenshotOverlay = null;
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error cargando página principal:', errorCode, errorDescription);
  });
}

function createAssistantWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  
  assistantWindow = new BrowserWindow({
    width: 440,
    height: 750,
    frame: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true, // Ocultar de la taskbar
    x: screenWidth - 460,
    y: 20,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    movable: true,
    // Configuraciones adicionales para Windows 11
    titleBarStyle: 'hidden',
    titleBarOverlay: false
  });
  
  try {
    const htmlPath = getValidAssetPath('assistant.html');
    console.log('Cargando ventana asistente desde:', htmlPath);
    assistantWindow.loadFile(htmlPath);
  } catch (error) {
    console.error('Error cargando assistant.html:', error);
    assistantWindow.loadURL('data:text/html,<h1>Error: No se pudo cargar assistant.html</h1>');
  }
  
  // Mantener oculto de la taskbar en todos los eventos
  assistantWindow.on('minimize', () => {
    assistantWindow.setSkipTaskbar(true);
  });

  assistantWindow.on('blur', () => {
    assistantWindow.setSkipTaskbar(true);
  });

  assistantWindow.on('focus', () => {
    assistantWindow.setSkipTaskbar(true);
  });

  assistantWindow.on('show', () => {
    assistantWindow.setSkipTaskbar(true);
  });

  assistantWindow.on('closed', () => assistantWindow = null);

  assistantWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  assistantWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error cargando página asistente:', errorCode, errorDescription);
  });
}

function showOrCreateAssistant() {
  if (!assistantWindow) {
    createAssistantWindow();
  } else {
    assistantWindow.show();
    // Asegurar que sigue oculto de la taskbar al mostrar
    assistantWindow.setSkipTaskbar(true);
  }
}

function createScreenshotOverlay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x: displayX, y: displayY } = primaryDisplay.bounds;

  displayInfo = {
    bounds: primaryDisplay.bounds,
    scaleFactor: primaryDisplay.scaleFactor,
    workArea: primaryDisplay.workArea,
    workAreaSize: primaryDisplay.workAreaSize
  };
  
  console.log('Display info:', displayInfo);
  
  screenshotOverlay = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: displayX,
    y: displayY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true, // Ocultar de la taskbar
    resizable: false,
    movable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  screenshotOverlay.setIgnoreMouseEvents(true);
  
  try {
    const htmlPath = getValidAssetPath('screenshot-overlay.html');
    console.log('Cargando overlay de captura desde:', htmlPath);
    screenshotOverlay.loadFile(htmlPath);
  } catch (error) {
    console.error('Error cargando screenshot-overlay.html:', error);
    screenshotOverlay.loadURL('data:text/html,<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);pointer-events:none;"></div>');
  }
  
  screenshotOverlay.on('closed', () => screenshotOverlay = null);

  screenshotOverlay.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error cargando overlay:', errorCode, errorDescription);
  });
}

function showScreenshotMode() {
  if (!assistantWindow || !assistantWindow.isVisible()) {
    return;
  }
  assistantWindow.webContents.send('check-ai-active');
}

function startScreenshotMode() {
  if (!screenshotOverlay) {
    createScreenshotOverlay();
  }
  
  screenshotMode = true;
  registerScreenshotShortcuts();
  screenshotOverlay.show();
  
  screenshotOverlay.webContents.once('dom-ready', () => {
    console.log('Overlay DOM ready, enviando área inicial:', captureArea);
    setTimeout(() => {
      if (screenshotOverlay && !screenshotOverlay.isDestroyed()) {
        screenshotOverlay.webContents.send('update-capture-area', captureArea);
      }
    }, 50);
  });
  
  setTimeout(() => {
    if (screenshotOverlay && !screenshotOverlay.isDestroyed()) {
      console.log('Enviando área inicial (fallback):', captureArea);
      screenshotOverlay.webContents.send('update-capture-area', captureArea);
    }
  }, 200);
}

function hideScreenshotMode() {
  if (screenshotOverlay) {
    screenshotOverlay.hide();
  }
  screenshotMode = false;
  unregisterScreenshotShortcuts();
}

function registerScreenshotShortcuts() {
  globalShortcut.register('Up', () => updateCaptureArea(0, -10, 0, 0));
  globalShortcut.register('Down', () => updateCaptureArea(0, 10, 0, 0));
  globalShortcut.register('Left', () => updateCaptureArea(-10, 0, 0, 0));
  globalShortcut.register('Right', () => updateCaptureArea(10, 0, 0, 0));
  globalShortcut.register('Shift+Up', () => updateCaptureArea(0, 0, 0, -10));
  globalShortcut.register('Shift+Down', () => updateCaptureArea(0, 0, 0, 10));
  globalShortcut.register('Alt+Left', () => updateCaptureArea(0, 0, -10, 0));
  globalShortcut.register('Alt+Right', () => updateCaptureArea(0, 0, 10, 0));
  globalShortcut.register('CommandOrControl+Up', () => updateCaptureArea(0, -50, 0, 0));
  globalShortcut.register('CommandOrControl+Down', () => updateCaptureArea(0, 50, 0, 0));
  globalShortcut.register('CommandOrControl+Left', () => updateCaptureArea(-50, 0, 0, 0));
  globalShortcut.register('CommandOrControl+Right', () => updateCaptureArea(50, 0, 0, 0));
  globalShortcut.register('CommandOrControl+Shift+J', () => takeScreenshotArea());
  globalShortcut.register('CommandOrControl+Shift+G', () => hideScreenshotMode());
}

function unregisterScreenshotShortcuts() {
  const shortcuts = [
    'Up', 'Down', 'Left', 'Right',
    'Shift+Up', 'Shift+Down', 'Alt+Left', 'Alt+Right',
    'CommandOrControl+Up', 'CommandOrControl+Down', 
    'CommandOrControl+Left', 'CommandOrControl+Right',
    'CommandOrControl+Shift+J', 'CommandOrControl+Shift+G'
  ];
  
  shortcuts.forEach(shortcut => {
    globalShortcut.unregister(shortcut);
  });
}

function updateCaptureArea(deltaX, deltaY, deltaWidth, deltaHeight) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
  
  const newX = captureArea.x + deltaX;
  const newY = captureArea.y + deltaY;
  const newWidth = captureArea.width + deltaWidth;
  const newHeight = captureArea.height + deltaHeight;
  
  captureArea.x = Math.max(0, Math.min(screenWidth - Math.max(50, newWidth), newX));
  captureArea.y = Math.max(0, Math.min(screenHeight - Math.max(50, newHeight), newY));
  captureArea.width = Math.max(50, Math.min(screenWidth - captureArea.x, newWidth));
  captureArea.height = Math.max(50, Math.min(screenHeight - captureArea.y, newHeight));
  
  console.log('Área de captura actualizada:', captureArea);
  
  if (screenshotOverlay && !screenshotOverlay.isDestroyed()) {
    screenshotOverlay.webContents.send('update-capture-area', captureArea);
  }
}

async function takeScreenshotArea() {
  if (!screenshotMode || !displayInfo) return;
  
  try {
    console.log('Tomando captura del área:', captureArea);
    console.log('Display info:', displayInfo);
    
    if (screenshotOverlay) {
      screenshotOverlay.hide();
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const imgBuffer = await screenshot({ format: 'png' });
    const sharp = require('sharp');
    const metadata = await sharp(imgBuffer).metadata();
    console.log('Metadata de la captura:', { width: metadata.width, height: metadata.height });
    console.log('Factor de escala de la pantalla:', displayInfo.scaleFactor);
    
    const scaleFactor = displayInfo.scaleFactor;
    
    const cropOptions = {
      left: Math.max(0, Math.round((captureArea.x - displayInfo.bounds.x) * scaleFactor)),
      top: Math.max(0, Math.round((captureArea.y - displayInfo.bounds.y) * scaleFactor)),
      width: Math.round(Math.max(1, captureArea.width * scaleFactor)),
      height: Math.round(Math.max(1, captureArea.height * scaleFactor))
    };
    
    console.log('Área original:', captureArea);
    console.log('Opciones de recorte ajustadas por escala:', cropOptions);
    
    if (cropOptions.left + cropOptions.width > metadata.width) {
      cropOptions.width = metadata.width - cropOptions.left;
      console.log('Ancho ajustado por límites de imagen:', cropOptions.width);
    }
    if (cropOptions.top + cropOptions.height > metadata.height) {
      cropOptions.height = metadata.height - cropOptions.top;
      console.log('Alto ajustado por límites de imagen:', cropOptions.height);
    }
    
    if (cropOptions.width <= 0 || cropOptions.height <= 0) {
      throw new Error('Dimensiones de recorte inválidas');
    }
    
    console.log('Opciones de recorte finales:', cropOptions);
    
    const croppedBuffer = await sharp(imgBuffer)
      .extract(cropOptions)
      .png()
      .toBuffer();
    
    const tempPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);
    fs.writeFileSync(tempPath, croppedBuffer);
    
    console.log('Captura guardada en:', tempPath);
    
    hideScreenshotMode();
    
    if (assistantWindow) {
      assistantWindow.webContents.send('screenshot-taken', tempPath);
    }
    
  } catch (error) {
    console.error('Error al tomar captura:', error);
    hideScreenshotMode();
    
    if (assistantWindow) {
      assistantWindow.webContents.send('screenshot-error', error.message);
    }
  }
}

function hideAssistant() {
  if (assistantWindow) {
    assistantWindow.hide();
  }
}

app.whenReady().then(() => {
  // Ocultar dock en macOS y configurar para Windows
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  // Configuración específica para Windows 11
  if (process.platform === 'win32') {
    // Evitar que la aplicación aparezca en la taskbar
    app.setAppUserModelId('com.mindpanel.launcher');
  }
  
  console.log('App is packaged:', app.isPackaged);
  console.log('App path:', app.getAppPath());
  console.log('__dirname:', __dirname);
  console.log('process.resourcesPath:', process.resourcesPath);
  console.log('process.cwd():', process.cwd());
  
  createMainWindow();
  mainWindow.show();
  // Asegurar que la ventana principal esté oculta de la taskbar
  mainWindow.setSkipTaskbar(true);

  ipcMain.on('launch-assistant', showOrCreateAssistant);
  ipcMain.on('ai-active-response', (event, isActive) => {
    console.log('IA activa:', isActive);
    if (isActive) {
      startScreenshotMode();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+E', () => {
    if (assistantWindow && assistantWindow.isVisible()) {
      hideAssistant();
    } else {
      showOrCreateAssistant();
    }
  });

  const aiShortcuts = [
    { accelerator: 'CommandOrControl+1', ai: 'chatgpt' },
    { accelerator: 'CommandOrControl+2', ai: 'claude' },
    { accelerator: 'CommandOrControl+3', ai: 'gemini' },
    { accelerator: 'CommandOrControl+4', ai: 'deepseek' },
    { accelerator: 'CommandOrControl+5', ai: 'mathos' }
  ];

  aiShortcuts.forEach(({ accelerator, ai }) => {
    globalShortcut.register(accelerator, () => {
      if (assistantWindow && assistantWindow.isVisible()) {
        assistantWindow.webContents.send('switch-ai', ai);
      }
    });
  });

  globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (assistantWindow && assistantWindow.isVisible()) {
      assistantWindow.webContents.send('show-selector');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    showScreenshotMode();
  });

  ipcMain.handle('get-screenshot-base64', async (event, filePath) => {
    try {
      const imgBuffer = fs.readFileSync(filePath);
      const imgBase64 = imgBuffer.toString('base64');
      return imgBase64;
    } catch (e) {
      console.error('Error leyendo archivo de imagen:', e);
      return null;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Evitar que la aplicación aparezca en el Alt+Tab de Windows
app.on('browser-window-created', (event, window) => {
  window.setSkipTaskbar(true);
});

// Configuración adicional para Windows 11
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
}
