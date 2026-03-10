import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        }
      },
      borderRadius: {
        xl: "1rem",
        '2xl': "1.5rem"
      },
      boxShadow: {
        glow: "0 20px 50px -25px rgba(77, 123, 255, 0.65)",
        soft: "0 15px 35px -20px rgba(2, 6, 23, 0.75)"
      },
      backgroundImage: {
        aurora:
          "radial-gradient(1000px circle at 0% 0%, rgba(124,92,255,0.25), transparent 45%), radial-gradient(1000px circle at 100% 100%, rgba(14,165,233,0.16), transparent 45%)"
      }
    }
  },
  plugins: []
};

export default config;
