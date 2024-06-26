const functions = require('@google-cloud/functions-framework');
const puppeteer = require('puppeteer');
const { execFile } = require('child_process');
const {Storage} = require('@google-cloud/storage');
const crypto = require("crypto");

const PUPPETEER_LAUNCH_OPTION = {
  args: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--single-process',
    '--lang=ja',
  ],
};
const PUPPETEER_PDF_OPTION = {
  format: "A4",
};
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_SCALE = 1;
const GS_EXPIRATION_MS = 300 * 1000; // 300秒

async function init() {
  setFontConfig();
  //logAllFonts();
  //logMatchedFonts();
}

async function setFontConfig() {
  const cwd = process.cwd();
  process.env.XDG_CONFIG_HOME = cwd;
  const child = execFile('fc-cache', ['-r'], (error, stdout, stderr) => {
    if(error) {
      throw error;
    }
    console.log("fc-cache", stdout);
  });
}

async function logAllFonts() {
  const child = execFile('fc-list', [''], (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    console.log(stdout);
  });
}

async function logMatchedFonts() {
  const child = execFile('fc-match', [':lang=ja'], (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    console.log("lang=ja", stdout);
  });
}

function getParams(req) {
  if(req.method !== "POST") {
    const error = new Error("only POST method are accepted");
    error.code = 405;
    throw error;
  }
  if(!req.body.url && !req.body.html) {
    const error = new Error("both url and html not specified");
    error.code = 400;
    throw error;
  }

  const width = req.body.width ? parseInt(req.body.width) : DEFAULT_WIDTH;
  const height = req.body.height ? parseInt(req.body.height) : DEFAULT_HEIGHT;
  const scale = req.body.scale ? parseInt(req.body.scale) : DEFAULT_SCALE;

  return [
    req.body.url,
    req.body.html,
    width,
    height,
    scale,
  ];
}

/*
  
*/
async function getNewPage(browser, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, scale = DEFAULT_SCALE) {
  const page = await browser.newPage();
  await page.setViewport({
    width: width,
    height: height,
    deviceScaleFactor: scale,
  });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP'
  });
  return page;
}

/*
  url: the URL for rendering
  type: "pdf" | "png"
  width: viewport width (ignored when type == "pdf")
  height: viewport height (ignored when type == "pdf")
  scale: device scale factor (ignored when type == "pdf")
*/
async function renderFromUrl(url, type = "pdf", width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, scale = DEFAULT_SCALE) {
  try {
    await init();
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await getNewPage(browser, width, height, scale);
    await page.goto(url, {
      waitUntil: "networkidle0"
    });
    const buffer = type === "png" ? await page.screenshot() : await page.pdf(PUPPETEER_PDF_OPTION);
    await browser.close();

    return buffer;
  }
  catch(ex) {
    throw ex;
  }
}

/*
  html: HTML for rendering
  type: "pdf" | "png"
  width: viewport width (ignored when type == "pdf")
  height: viewport height (ignored when type == "pdf")
  scale: device scale factor (ignored when type == "pdf")
*/
async function renderFromHtml(html, type = "pdf", width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, scale = DEFAULT_SCALE) {
  try {
    await init();
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await getNewPage(browser, width, height, scale);
    await page.setContent(html);
    const buffer = type === "png" ? await page.screenshot() : await page.pdf(PUPPETEER_PDF_OPTION);
    await browser.close();

    return buffer;
  }
  catch(ex) {
    throw ex;
  }
}

/*
  URLもしくはHTMLで指定されたWebページのスクリーンショットを作成する
  method: POST
  @url : 取得するページのURL
  @html : 取得するページのHTML
  @width : ビューポートの幅 (optional, default: 1920)
  @height : ビューポートの高さ (optional, default: 1080)
  @scale : デバイススケールファクター (optional, default: 1)
*/
functions.http('screenshot', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      // Send response to OPTIONS requests
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
    }
    else {
      const [url, html, width, height, scale] = getParams(req);
      const screenshot = url ? await renderFromUrl(url, "png", width, height, scale) : await renderFromHtml(html, "png", width, height, scale);
      res.type('png').send(screenshot);
    }
  }
  catch(err) {
    console.error(err);
    res.status(err.code || 500).send(err);
  }
});

/*
  URLもしくはHTMLで指定されたWebページをPDFにする
  method: POST
  @url : 取得するページのURL
  @html : 取得するページのHTML
*/
functions.http('make_pdf', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      // Send response to OPTIONS requests
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
    }
    else {
      const [url, html, width, height, scale] = getParams(req);
      const pdf = url ? await renderFromUrl(url, "pdf", width, height, scale) : await renderFromHtml(html, "pdf", width, height, scale);
      res.type('pdf').send(pdf);
    }
  }
  catch(err) {
    console.error(err);
    res.status(err.code || 500).send(err);
  }
});

/*
  URLもしくはHTMLで指定されたWebページをPDFにし、Cloud Storageに保存する
  method: POST
  @url : 取得するページのURL
  @html : 取得するページのHTML
  戻り値 : JSON {url:, expires:}
*/
functions.http('make_pdf_gs', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      // Send response to OPTIONS requests
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
    }
    else {
      const [url, html, width, height, scale] = getParams(req);
      const pdf = url ? await renderFromUrl(url, "pdf", width, height, scale) : await renderFromHtml(html, "pdf", width, height, scale);
      const bucketName = process.env.BUCKET_NAME;
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const filename = `${crypto.randomUUID()}.pdf`;
      const file = bucket.file(filename);
      await file.save(pdf);
      const expires = Date.now() + GS_EXPIRATION_MS;
      const expiresAt = new Date(expires);
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: expires,
      });
      const result = {
        url: signedUrl,
        expires: expiresAt.toJSON(),
      };
      res.json(result);
    }
  }
  catch(err) {
    console.error(err);
    res.status(err.code || 500).send(err);
  }
});
