// Metadados das UFs para o mapa-cartograma (posições aproximadas em grade) e nomes.

export interface UfMeta {
  uf: string;      // sigla minúscula ("zz" = exterior)
  sigla: string;   // rótulo no tile
  name: string;
  region: 'N' | 'NE' | 'CO' | 'SE' | 'S' | 'EX';
  row: number;
  col: number;
}

export const UFS: UfMeta[] = [
  { uf: 'rr', sigla: 'RR', name: 'Roraima', region: 'N', row: 0, col: 2 },
  { uf: 'ap', sigla: 'AP', name: 'Amapá', region: 'N', row: 0, col: 4 },
  { uf: 'am', sigla: 'AM', name: 'Amazonas', region: 'N', row: 1, col: 1 },
  { uf: 'pa', sigla: 'PA', name: 'Pará', region: 'N', row: 1, col: 3 },
  { uf: 'ma', sigla: 'MA', name: 'Maranhão', region: 'NE', row: 1, col: 4 },
  { uf: 'ce', sigla: 'CE', name: 'Ceará', region: 'NE', row: 1, col: 5 },
  { uf: 'rn', sigla: 'RN', name: 'Rio Grande do Norte', region: 'NE', row: 1, col: 6 },
  { uf: 'ac', sigla: 'AC', name: 'Acre', region: 'N', row: 2, col: 0 },
  { uf: 'ro', sigla: 'RO', name: 'Rondônia', region: 'N', row: 2, col: 1 },
  { uf: 'mt', sigla: 'MT', name: 'Mato Grosso', region: 'CO', row: 2, col: 2 },
  { uf: 'to', sigla: 'TO', name: 'Tocantins', region: 'N', row: 2, col: 3 },
  { uf: 'pi', sigla: 'PI', name: 'Piauí', region: 'NE', row: 2, col: 4 },
  { uf: 'pe', sigla: 'PE', name: 'Pernambuco', region: 'NE', row: 2, col: 5 },
  { uf: 'pb', sigla: 'PB', name: 'Paraíba', region: 'NE', row: 2, col: 6 },
  { uf: 'go', sigla: 'GO', name: 'Goiás', region: 'CO', row: 3, col: 2 },
  { uf: 'df', sigla: 'DF', name: 'Distrito Federal', region: 'CO', row: 3, col: 3 },
  { uf: 'ba', sigla: 'BA', name: 'Bahia', region: 'NE', row: 3, col: 4 },
  { uf: 'se', sigla: 'SE', name: 'Sergipe', region: 'NE', row: 3, col: 5 },
  { uf: 'al', sigla: 'AL', name: 'Alagoas', region: 'NE', row: 3, col: 6 },
  { uf: 'ms', sigla: 'MS', name: 'Mato Grosso do Sul', region: 'CO', row: 4, col: 1 },
  { uf: 'mg', sigla: 'MG', name: 'Minas Gerais', region: 'SE', row: 4, col: 3 },
  { uf: 'es', sigla: 'ES', name: 'Espírito Santo', region: 'SE', row: 4, col: 4 },
  { uf: 'sp', sigla: 'SP', name: 'São Paulo', region: 'SE', row: 5, col: 2 },
  { uf: 'rj', sigla: 'RJ', name: 'Rio de Janeiro', region: 'SE', row: 5, col: 3 },
  { uf: 'pr', sigla: 'PR', name: 'Paraná', region: 'S', row: 6, col: 2 },
  { uf: 'sc', sigla: 'SC', name: 'Santa Catarina', region: 'S', row: 7, col: 2 },
  { uf: 'rs', sigla: 'RS', name: 'Rio Grande do Sul', region: 'S', row: 8, col: 2 },
  { uf: 'zz', sigla: 'EXT', name: 'Exterior', region: 'EX', row: 8, col: 5 },
];

export const UF_BY_CODE: Record<string, UfMeta> = Object.fromEntries(UFS.map((u) => [u.uf, u]));
export const MAP_ROWS = 9;
export const MAP_COLS = 7;
