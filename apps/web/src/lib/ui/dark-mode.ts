// Dark mode toggle functionality
// Persists preference in localStorage, falls back to OS prefers-color-scheme

export function initializeDarkMode() {
  const html = document.documentElement;
  const saved = localStorage.getItem("neoams-dark-mode");

  if (saved !== null) {
    html.classList.toggle("dark", saved === "true");
  } else {
    // Respect OS preference on first visit
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    html.classList.toggle("dark", mq.matches);
  }
}

export function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle("dark");
  if (isDark) {
    localStorage.setItem("neoams-dark-mode", "true");
  } else {
    localStorage.setItem("neoams-dark-mode", "false");
  }
  return isDark;
}
