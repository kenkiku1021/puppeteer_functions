const functions = require('@google-cloud/functions-framework');
const puppeteer = require('puppeteer');

const PUPPETEER_LAUNCH_OPTION = {
  args: ['--lang=ja']
};

function checkRequest(req) {
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
}

/*
  url: the URL for rendering
  type: "pdf" | "png"
*/
async function renderFromUrl(url, type = "pdf") {
  try {
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await browser.newPage();
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
*/
async function renderFromHtml(html, type = "pdf") {
  try {
    const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTION);
    const page = await browser.newPage();
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
  params: 'url' もしくは 'html' のいずれかが必須
*/
functions.http('screenshot', async (req, res) => {
  try {
    checkRequest(req);
    const screenshot = req.body.url ? await renderFromUrl(req.body.url, "png") : await renderFromHtml(req.body.html, "png");
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
  params: 'url' もしくは 'html' のいずれかが必須
*/
functions.http('make_pdf', async (req, res) => {
  try {
    checkRequest(req);
    const pdf = req.body.url ? await renderFromUrl(req.body.url, "pdf") : await renderFromHtml(req.body.html, "pdf");
    res.type('pdf').send(pdf);
  }
  catch(err) {
    console.error(err);
    res.status(err.code || 500).send(err);
  }
});
