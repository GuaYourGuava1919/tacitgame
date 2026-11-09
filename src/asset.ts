/** 取得 public/ 底下的檔案網址；部署在子路徑（例如 GitHub Pages 的 /tacitgame/）時也正確 */
export const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`
