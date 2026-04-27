import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // S/PASS Design System tokens
        forest: {
          DEFAULT: "#1F3B2F",
          80: "rgba(31, 59, 47, 0.8)",
          60: "rgba(31, 59, 47, 0.6)",
          30: "rgba(31, 59, 47, 0.3)",
        },
        cream: "#F1E6D2",
        mist: "#ECEAE3",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        mark: [
          "var(--font-mark)",
          "Futura",
          "Trebuchet MS",
          "Century Gothic",
          "sans-serif",
        ],
        jp: [
          "var(--font-jp)",
          "Hiragino Sans",
          "Yu Gothic",
          "sans-serif",
        ],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
