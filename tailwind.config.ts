import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
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
        soft: "0 16px 40px -24px rgba(0, 0, 0, 0.55)",
        surface: "0 20px 50px -32px rgba(5, 8, 12, 0.5)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.08)"
      }
    }
  },
  plugins: []
};

export default config;
