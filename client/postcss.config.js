import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// Vite arranca desde la raíz del repo, así que la ruta de la config de Tailwind
// tiene que ser explícita; si no, Tailwind no la encuentra y genera el CSS vacío.
export default {
  plugins: {
    tailwindcss: { config: `${here}tailwind.config.js` },
    autoprefixer: {},
  },
};
