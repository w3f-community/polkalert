import db from '../db'

//TODO: Configurable logging levels
const logger = {
  debug: (title: string, content: string) => {
    console.log(title + '::' + content)
    db.log({
      content,
      title,
      type: 'debug'
    })
  },
  success: (title: string, content: string) => {
    console.log(title + '::' + content)
    db.log({
      content,
      title,
      type: 'success'
    })
  },
  log: (title: string, content: string) => {
    console.log(title + '::' + content)
    db.log({
      content,
      title,
      type: 'info'
    })
  },
  warn: (title: string, content: string) => {
    console.log(title + '::' + content)
    db.log({
      content,
      title,
      type: 'warn'
    })
  },
  error: (title: string, content: Error | any) => {
    console.error(title + '::', content)
    db.log({
      content: content
        ? (content.toString ? content.toString() : content) +
          (content.stack ? '\n' + content.stack.toString() : '')
        : '',
      title,
      type: 'error'
    })
  }
}

export default logger
