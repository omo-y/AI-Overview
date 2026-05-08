import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#667085",
        line: "#d9e2ec",
        panel: "#f7fafc",
        accent: "#0f766e"
      }
    }
  },
  plugins: []
};

export default config;
