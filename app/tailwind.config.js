/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'bg-primary', 'text-primary', 'border-primary', 'stroke-primary', 'shadow-primary',
    'bg-accent', 'text-accent', 'border-accent', 'stroke-accent', 'shadow-accent',
    'bg-blue-500', 'text-blue-500', 'border-blue-500', 'stroke-blue-500', 'shadow-blue-500',
    'bg-primary/10', 'bg-primary/20', 'bg-primary/30', 'bg-primary/40', 'bg-primary/50',
    'bg-accent/10', 'bg-accent/20', 'bg-accent/30', 'bg-accent/40', 'bg-accent/50',
    'border-primary/10', 'border-primary/20', 'border-primary/30', 'border-primary/40', 'border-primary/50',
    'border-accent/10', 'border-accent/20', 'border-accent/30', 'border-accent/40', 'border-accent/50',
    'shadow-primary/20', 'shadow-primary/30', 'shadow-primary/40', 'shadow-primary/50',
    'shadow-accent/20', 'shadow-accent/30', 'shadow-accent/40', 'shadow-accent/50',
    'glow-primary', 'glow-accent'
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#121212',
        surfaceHighlight: '#1E1E1E',
        primary: '#8B5CF6',
        primaryGlow: 'rgba(139, 92, 246, 0.4)',
        accent: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Grotesk', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 25px rgba(139, 92, 246, 0.4)',
        'glow-primary': '0 0 25px rgba(139, 92, 246, 0.4)',
        'glow-accent': '0 0 25px rgba(16, 185, 129, 0.4)',
      }
    },
  },
  plugins: [],
}
