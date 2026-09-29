declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL: string;
    };
  }
}

const isDev = import.meta.env.DEV;
export const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || (isDev ? "http://localhost:8000" : "");