import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works BOTH on a GitHub Pages project subpath
  // (https://<user>.github.io/<repo>/) AND on a custom domain at the root — no rebuild
  // needed when you later point cedarlakelawn.com at it.
  base: './',
});
