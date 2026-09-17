// Permite `import sql from './arquivo.sql?raw'` nos módulos do processo
// main. O Vite (via electron-vite) resolve isso em tempo de build,
// embutindo o conteúdo do arquivo como string - nenhum arquivo .sql
// precisa ser copiado/lido em runtime.
declare module '*.sql?raw' {
  const content: string
  export default content
}
