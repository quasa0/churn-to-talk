import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211a",
        moss: "#465a45",
        line: "#d8dfd7",
        paper: "#fbfbf7",
        field: "#f2f5ef",
        action: "#2866c7",
        success: "#28784a",
        warning: "#b55f16"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 33, 26, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
