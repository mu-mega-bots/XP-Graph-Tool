import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600 });

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/compute", (req, res) => {
  const { funcs = [], xpMax = 2000 } = req.body;

  try {
    const xp = Array.from({ length: xpMax }, (_, i) => i);

    const datasets = funcs.map(({ name, funcString }, idx) => {
      const sandbox = {};
      vm.createContext(sandbox);
      const wrappedFunc = `( ${funcString.replace(/\n/g, ' ')} )`;
      const script = new vm.Script(wrappedFunc);
      const xpFunc = script.runInContext(sandbox);

      if (typeof xpFunc !== "function") {
        throw new Error(`Invalid function at index ${idx}`);
      }

      const levels = [];
      for (let i = 0; i < xpMax; i++) {
        try {
          const val = xpFunc(i);
          if (typeof val !== "number" || !isFinite(val)) throw new Error();
          levels.push(val);
        } catch {
          levels.push(null);
        }
      }

      return { name, levels };
    });

    res.json({ xp, datasets });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/graph", async (req, res) => {
  const { name = "Algorithm", algorithm, xpMax = 2000, format = "" } = req.query;

  if (!algorithm) return res.status(400).send("Missing algorithm query parameter");

  const xpLimit = Number(xpMax) || 2000;

  const xp = Array.from({ length: xpLimit }, (_, i) => i);

  let levels;
  try {
    const sandbox = {};
    vm.createContext(sandbox);
    const script = new vm.Script(`(${algorithm.replace(/\n/g, " ")})`);
    const xpFunc = script.runInContext(sandbox);

    levels = xp.map(x => {
      try {
        const val = xpFunc(x);
        return (typeof val === "number" && isFinite(val)) ? val : null;
      } catch {
        return null;
      }
    });
  } catch (err) {
    return res.status(400).send(`Algorithm error: ${err.message}`);
  }

  const configuration = {
    type: "line",
    data: {
      labels: xp,
      datasets: [{
        label: name,
        data: levels,
        borderColor: 'blue',
        fill: false,
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: "XP" } },
        y: { title: { display: true, text: "Level" } }
      }
    }
  };

  if (format === "png" || format === "svg") {
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration, format === "svg" ? "image/svg+xml" : "image/png");
    res.setHeader("Content-Type", format === "svg" ? "image/svg+xml" : "image/png");
    return res.send(imageBuffer);
  }

  const graphUrl = `/graph?${new URLSearchParams({ name, algorithm, xpMax, format: "png" })}`;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${name} Graph</title>

      <!-- Open Graph / Social meta tags -->
      <meta property="og:title" content="${name} Graph">
      <meta property="og:description" content="XP → Level graph dynamically generated">
      <meta property="og:image" content="${graphUrl}">
      <meta property="og:type" content="website">

      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${name} Graph">
      <meta name="twitter:description" content="XP → Level graph dynamically generated">
      <meta name="twitter:image" content="${graphUrl}">
    </head>
    <body>
      <h2>${name} Graph</h2>
      <img src="${graphUrl}" alt="${name} Graph">
    </body>
    </html>
  `);
});


app.listen(7183, () => console.log("Server running on http://localhost:7183"));
