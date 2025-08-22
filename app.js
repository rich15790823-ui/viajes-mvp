const express = require('express');
const app = express();

// 1) Motor de vistas EJS
app.set('view engine', 'ejs');
app.set('views', 'views'); // carpeta /views

// 2) Archivos estáticos (CSS, JS, imágenes)
app.use(express.static('public'));

// Ruta de prueba (luego la ajustamos)
app.get('/', (req, res) => {
  res.render('landing'); // -> renderiza views/landing.ejs
});

// (tu app.listen(...) ya existente)

