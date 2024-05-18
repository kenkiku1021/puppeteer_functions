const functions = require('@google-cloud/functions-framework');
const puppeteer = require('puppeteer');

const PUPPETEER_LAUNCH_OPTION = {
  args: ['--lang=ja']
};
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_SCALE = 1;

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
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await getNewPage(browser, width, height, scale);
    await page.goto(url, {
      waitUntil: "networkidle0"
    });
    const buffer = type === "png" ? await page.screenshot() : await page.pdf();
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
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await getNewPage(browser, width, height, scale);
    await page.setContent(html);
    const buffer = type === "png" ? await page.screenshot() : await page.pdf();
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
    const [url, html, width, height, scale] = getParams(req);
    const screenshot = url ? await renderFromUrl(url, "png", width, height, scale) : await renderFromHtml(html, "png", width, height, scale);
    res.type('png').send(screenshot);
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
  @width : ビューポートの幅 (optional, default: 1920)
  @height : ビューポートの高さ (optional, default: 1080)
  @scale : デバイススケールファクター (optional, default: 1)
*/
functions.http('make_pdf', async (req, res) => {
  try {
    const [url, html, width, height, scale] = getParams(req);
    const pdf = url ? await renderFromUrl(url, "pdf", width, height, scale) : await renderFromHtml(html, "pdf", width, height, scale);
    res.type('pdf').send(pdf);
  }
  catch(err) {
    console.error(err);
    res.status(err.code || 500).send(err);
  }
});
