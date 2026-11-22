// Consulta de Overpass para bajar Sestao entero, con la ría y los edificios completos.
// Se puede pegar en https://overpass-turbo.eu o lanzar con el enlace del README.
[out:xml][timeout:180];
(
  node(43.2910,-3.0330,43.3275,-2.9720);
  way(43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["natural"="water"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["waterway"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["building"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["landuse"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["leisure"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["highway"](43.2910,-3.0330,43.3275,-2.9720);
  relation["type"="multipolygon"]["amenity"](43.2910,-3.0330,43.3275,-2.9720);
  relation["boundary"="administrative"]["name"="Sestao"](43.2910,-3.0330,43.3275,-2.9720);
);
(._;>;);
out body qt;
