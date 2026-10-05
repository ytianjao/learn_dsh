import {existsSync} from 'node:fs'

/** Locate a usable Chromium-family browser without downloading anything. */
export function findBrowserExecutable(env:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform):string|null{
 if(env.LEARNLOOP_PDF_BROWSER&&existsSync(env.LEARNLOOP_PDF_BROWSER))return env.LEARNLOOP_PDF_BROWSER
 const candidates:Record<string,string[]>={
  win32:[env['PROGRAMFILES(X86)']&&`${env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,env.PROGRAMFILES&&`${env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,env.PROGRAMFILES&&`${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,env['PROGRAMFILES(X86)']&&`${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,env.LOCALAPPDATA&&`${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`].filter((item):item is string=>Boolean(item)),
  darwin:['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux:['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/microsoft-edge'],
 }
 for(const candidate of candidates[platform]??[])if(existsSync(candidate))return candidate
 return null
}

/** Render one print HTML string to a PDF file through the locally installed browser. */
export async function renderPdfFromHtml(html:string,outFile:string,options:{browserPath?:string;timeoutMs?:number}={}):Promise<void>{
 const executablePath=options.browserPath??findBrowserExecutable()
 if(!executablePath)throw new Error('PDF_BROWSER_NOT_FOUND')
 const {chromium}=await import('playwright-core')
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 try{
  const page=await browser.newPage()
  await page.setContent(html,{waitUntil:'load',timeout:options.timeoutMs??30_000})
  await page.pdf({path:outFile,format:'A4',printBackground:true,margin:{top:'18mm',bottom:'18mm',left:'16mm',right:'16mm'}})
 }finally{await browser.close()}
}
