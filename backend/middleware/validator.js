const { validationResult } = require('express-validator');

// Middleware genérico para interceptar errores de express-validator
exports.validateResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Errores de validación',
      detalles: errors.array()
    });
  }
  next();
};
