const { contextBridge, ipcRenderer } = require('electron');

var addon = require('../native/build/Release/hello.node')

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    stopCamera() {
      var command = []
      command.type = 'stopCamera'
      ipcRenderer.send('ipc-example', command);
    },
    startCamera() {
      var command = []
      command.type = 'startCamera'
      ipcRenderer.send('ipc-example', command);
    },
    setDimention(width, height) {
      var command = []
      command.type = 'setDimention'
      command.width = width
      command.height = height
      ipcRenderer.send('ipc-example', command);
    },
    on(channel, func) {
      const validChannels = ['ipc-example', 'ipc-example_stats', 'ipc-example_frame'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    once(channel, func) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    },
    removeListener(channel) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
});
