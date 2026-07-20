const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("syDesktop", {
  async saveBlob(blob, name) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    return ipcRenderer.invoke("dialog:save-blob", { name, base64 });
  },
  onMenu(channel, cb) {
    ipcRenderer.on(channel, () => cb && cb());
  },
  onExportDocx(cb) {
    ipcRenderer.on("menu:export-docx", () => cb && cb());
  },
  reverseGeocode(lat, lng) {
    return ipcRenderer.invoke("geo:reverse", { lat, lng });
  },
  searchPlaces(q) {
    return ipcRenderer.invoke("geo:search", { q });
  },
  ipLocate() {
    return ipcRenderer.invoke("geo:ip");
  },
  getSettings() {
    return ipcRenderer.invoke("settings:get");
  },
  setSettings(partial) {
    return ipcRenderer.invoke("settings:set", partial);
  },
  pickDirectory() {
    return ipcRenderer.invoke("dialog:pick-directory");
  },
  openProject() {
    return ipcRenderer.invoke("project:open");
  },
  saveProject(payload) {
    return ipcRenderer.invoke("project:save", payload);
  },
  autosaveProject(payload) {
    return ipcRenderer.invoke("project:autosave", payload);
  },
});
