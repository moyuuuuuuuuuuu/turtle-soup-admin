import DOMPurify from 'dompurify'

const ESC = String.fromCharCode(0x1b)

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const renderMarkdown = (content?: string) => {
  if (!content) return ''
  const html = content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'code', 'li', 'ul', 'br', 'a', 'p'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/)|#)/i
  })
}

export const ansiToHtml = (text: string) => {
  // 先处理 ANSI 颜色代码
  const colorPattern = new RegExp(`${ESC}\\[([0-9;]+)m`, 'g')
  let result = escapeHtml(text).replace(colorPattern, function (match, codes) {
    const codeList = codes.split(';').map((c: string) => parseInt(c, 10))

    // 如果是重置代码 (0 或空)，返回闭标签
    if (codeList.length === 1 && (codeList[0] === 0 || isNaN(codeList[0]))) {
      return '</span>'
    }

    const styles: string[] = []
    codeList.forEach((c: number) => {
      switch (c) {
        case 0:
          // 重置 - 不添加样式，在上面已处理
          break
        case 1:
          styles.push('font-weight:bold')
          break
        case 3:
          styles.push('font-style:italic')
          break
        case 4:
          styles.push('text-decoration:underline')
          break
        case 30:
          styles.push('color:black')
          break
        case 31:
          styles.push('color:red')
          break
        case 32:
          styles.push('color:green')
          break
        case 33:
          styles.push('color:yellow')
          break
        case 34:
          styles.push('color:blue')
          break
        case 35:
          styles.push('color:magenta')
          break
        case 36:
          styles.push('color:cyan')
          break
        case 37:
          styles.push('color:white')
          break
        // 亮色/高亮色
        case 90:
          styles.push('color:#888')
          break
        case 91:
          styles.push('color:#f55')
          break
        case 92:
          styles.push('color:#5f5')
          break
        case 93:
          styles.push('color:#ff5')
          break
        case 94:
          styles.push('color:#55f')
          break
        case 95:
          styles.push('color:#f5f')
          break
        case 96:
          styles.push('color:#5ff')
          break
        case 97:
          styles.push('color:#fff')
          break
      }
    })
    return styles.length ? `<span style="${styles.join(';')}">` : ''
  })

  // 清理可能残留的其他 ANSI 转义序列 (如光标移动等)
  const cleanupPattern = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g')
  result = result.replace(cleanupPattern, '')

  return result
}
