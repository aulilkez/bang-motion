module.exports = {
  content: ["./studio/app/templates/**/*.html", "./studio/app/static/js/**/*.js"],
  theme: { extend: { colors: {
    zinc: require("tailwindcss/colors").zinc,
    background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
    card: "hsl(var(--card))", muted: "hsl(var(--muted))", "muted-foreground": "hsl(var(--muted-foreground))",
    border: "hsl(var(--border))", input: "hsl(var(--input))", primary: "hsl(var(--primary))",
    "primary-foreground": "hsl(var(--primary-foreground))", ring: "hsl(var(--ring))"
  }, borderRadius: { xl: "var(--radius)" } } },
  plugins: [],
};
