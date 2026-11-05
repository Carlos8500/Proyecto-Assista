INSERT INTO negocios (nombre)
SELECT 'Mesa Clara'
WHERE NOT EXISTS (
    SELECT 1 FROM negocios WHERE nombre = 'Mesa Clara'
);
