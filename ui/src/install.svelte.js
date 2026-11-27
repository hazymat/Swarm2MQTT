// On the Home Screen? An iPhone opens the page full screen from there, without Safari's bars; other browsers can install it as an app
export const install = $state({prompt: null});
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
export const isPhone = () => matchMedia("(max-width: 700px)").matches;
// Chrome and Edge offer their own install prompt (only over https); keep it for the Install button
addEventListener("beforeinstallprompt", event => {event.preventDefault(); install.prompt = event});
addEventListener("appinstalled", () => {install.prompt = null});
export async function promptInstall() {const prompt = install.prompt; if (!prompt) return false; install.prompt = null; prompt.prompt(); const choice = await prompt.userChoice.catch(() => null); return choice?.outcome === "accepted"}
