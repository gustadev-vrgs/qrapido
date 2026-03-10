import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          50: "#f4f5f6",
          100: "#e6e8ea",
          200: "#cfd3d6",
          300: "#acb3b9",
          400: "#7c8790",
          500: "#5d6870",
          600: "#49545c",
          700: "#3a4349",
          800: "#2b3136",
          900: "#1c2125",
          950: "#121518"
        },
        emeraldAccent: {
          50: "#f0fdf8",
          100: "#dcfce9",
          200: "#bbf7d5",
          300: "#86efb2",
          400: "#4ade87",
          500: "#22c55f",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d"
        }
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(0,0,0,0.25)",
        surface: "0 2px 20px rgba(8,10,12,0.08)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
