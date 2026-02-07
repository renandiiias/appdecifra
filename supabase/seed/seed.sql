insert into public.artists (name, name_search)
values
  ('Ministério Luz', 'ministerio luz'),
  ('Vozes da Fé', 'vozes da fe'),
  ('Coração Adoração', 'coracao adoracao')
on conflict do nothing;

insert into public.songs (
  title,
  title_search,
  artist_id,
  lyrics_chords,
  original_key,
  tuning,
  capo,
  category
)
values
  (
    'Caminho de Graça',
    'caminho de graca',
    (select id from public.artists where name = 'Ministério Luz' limit 1),
    'C  G/B  Am  F\nC  G  F\n\nSenhor, guia meus passos\nC  G/B  Am  F\nEm Tua luz eu vou',
    'C',
    'E A D G B E',
    null,
    'Congregacional'
  ),
  (
    'Fonte Viva',
    'fonte viva',
    (select id from public.artists where name = 'Ministério Luz' limit 1),
    'D  A/C#  Bm  G\nD  A  G\n\nTu és a fonte viva\nD  A/C#  Bm  G',
    'D',
    'E A D G B E',
    2,
    'Louvor'
  ),
  (
    'Paz no Deserto',
    'paz no deserto',
    (select id from public.artists where name = 'Vozes da Fé' limit 1),
    'Em  C  G  D\nEm  C  D\n\nPaz no deserto\nEm  C  G  D',
    'Em',
    'E A D G B E',
    null,
    'Louvor'
  ),
  (
    'Luz da Manhã',
    'luz da manha',
    (select id from public.artists where name = 'Vozes da Fé' limit 1),
    'G  D/F#  Em  C\nG  D  C\n\nLuz da manhã me envolve',
    'G',
    'E A D G B E',
    null,
    'Hinos'
  ),
  (
    'Sempre Fiel',
    'sempre fiel',
    (select id from public.artists where name = 'Coração Adoração' limit 1),
    'A  E/G#  F#m  D\nA  E  D\n\nSempre fiel, Senhor',
    'A',
    'E A D G B E',
    null,
    'Louvor'
  ),
  (
    'Canto Novo',
    'canto novo',
    (select id from public.artists where name = 'Coração Adoração' limit 1),
    'F  C/E  Dm  Bb\nF  C  Bb\n\nUm canto novo nasce',
    'F',
    'E A D G B E',
    1,
    'Louvor'
  ),
  (
    'Refúgio',
    'refugio',
    (select id from public.artists where name = 'Coração Adoração' limit 1),
    'Bm  G  D  A\nBm  G  A\n\nTu és meu refúgio',
    'Bm',
    'E A D G B E',
    null,
    'Congregacional'
  ),
  (
    'Esperança Viva',
    'esperanca viva',
    (select id from public.artists where name = 'Vozes da Fé' limit 1),
    'C  F  G\nC  F  G\n\nEsperança viva em Ti',
    'C',
    'E A D G B E',
    null,
    'Louvor'
  );

-- Hinos fictícios para teste (estilo Harpa, sem direitos autorais)
insert into public.artists (name, name_search)
values
  ('Coral Esperança', 'coral esperanca'),
  ('Ministério Aurora', 'ministerio aurora'),
  ('Vozes do Caminho', 'vozes do caminho'),
  ('Harpa Viva', 'harpa viva'),
  ('Louvor da Graça', 'louvor da graca')
on conflict do nothing;

with songs_data as (
  select * from (
    values
      (
        'Luz da Promessa',
        'luz da promessa',
        'Coral Esperança',
        'C  G/B  Am  F\nLuz da promessa sobre mim\nC  G  F\nGuia meu caminhar\nF  G  Em  Am\nTua palavra e caminho\nF  G  C\nDescanso no teu amor',
        'C',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Caminho Seguro',
        'caminho seguro',
        'Ministério Aurora',
        'G  D/F#  Em  C\nCaminho seguro me sustenta\nG  D  C\nTua luz me faz viver\nEm  C  G\nPasso a passo sigo firme\nD  C  G\nTua paz me faz vencer',
        'G',
        'E A D G B E',
        2,
        'Louvor'
      ),
      (
        'Graça que Alcança',
        'graca que alcanca',
        'Vozes do Caminho',
        'D  A/C#  Bm  G\nGraca que alcanca o coracao\nD  A  G\nRenova meu viver\nBm  G  D\nNada pode separar\nA  G  D\nDo teu amor sem fim',
        'D',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Rocha Eterna',
        'rocha eterna',
        'Harpa Viva',
        'E  B/D#  C#m  A\nRocha eterna e fundamento\nE  B  A\nFirme estou em ti\nC#m  A  E\nTeu favor me fortalece\nB  A  E\nNao vou desistir',
        'E',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Casa de Paz',
        'casa de paz',
        'Louvor da Graça',
        'A  E/G#  F#m  D\nCasa de paz e abrigo\nA  E  D\nNo teu amor eu vou\nF#m  D  A\nTua presenca me envolve\nE  D  A\nMeu coracao louvou',
        'A',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Voz do Bom Pastor',
        'voz do bom pastor',
        'Coral Esperança',
        'Em  C  G  D\nVoz do bom pastor me chama\nEm  C  D\nEu quero obedecer\nG  D  Em\nTeu cuidado me acompanha\nC  D  G\nEu vou permanecer',
        'Em',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Amanhecer da Fé',
        'amanhecer da fe',
        'Ministério Aurora',
        'F  C/E  Dm  Bb\nAmanhecer da fe me acorda\nF  C  Bb\nNovo dia de amor\nDm  Bb  F\nTua graça me renova\nC  Bb  F\nPara te seguir',
        'F',
        'E A D G B E',
        1,
        'Louvor'
      ),
      (
        'Fonte do Perdão',
        'fonte do perdao',
        'Vozes do Caminho',
        'C  Am  F  G\nFonte do perdao me alcança\nC  F  G\nLava meu viver\nAm  F  C\nTeu amor me reergue\nG  F  C\nPosso renascer',
        'C',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Pão do Céu',
        'pao do ceu',
        'Harpa Viva',
        'G  D/F#  Em  C\nPao do ceu sustenta a alma\nG  D  C\nEm teu amor estou\nEm  C  G\nTu es vida verdadeira\nD  C  G\nMeu coracao louvou',
        'G',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Alma Descansa',
        'alma descansa',
        'Louvor da Graça',
        'Dm  Bb  F  C\nAlma descansa na tua paz\nDm  Bb  C\nMeu medo se desfez\nBb  F  Dm\nTua voz me acalma\nC  Bb  F\nEm ti eu viverei',
        'Dm',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Clamor de Esperança',
        'clamor de esperanca',
        'Coral Esperança',
        'A  E/G#  F#m  D\nClamor de esperanca sobe ao ceu\nA  E  D\nTua resposta vem\nF#m  D  A\nTeu cuidado nao falha\nE  D  A\nMeu louvor sustem',
        'A',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Rio de Vida',
        'rio de vida',
        'Ministério Aurora',
        'E  B/D#  C#m  A\nRio de vida flui em mim\nE  B  A\nRenova meu ser\nC#m  A  E\nTua alegria me alcança\nB  A  E\nEu vou agradecer',
        'E',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Sopro Santo',
        'sopro santo',
        'Vozes do Caminho',
        'Bm  G  D  A\nSopro santo move o meu interior\nBm  G  A\nTranquilo estou\nD  A  Bm\nTua vida me renova\nG  A  D\nQuero te seguir',
        'Bm',
        'E A D G B E',
        2,
        'Louvor'
      ),
      (
        'Palavra Viva',
        'palavra viva',
        'Harpa Viva',
        'C  G/B  Am  F\nPalavra viva e sustento\nC  G  F\nFarol no meu viver\nAm  F  C\nTeu ensino me levanta\nG  F  C\nPosso compreender',
        'C',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Refúgio do Altíssimo',
        'refugio do altissimo',
        'Louvor da Graça',
        'G  D/F#  Em  C\nRefugio do altissimo e minha forca\nG  D  C\nNao temerei\nEm  C  G\nDebaixo das tuas asas\nD  C  G\nEu descansarei',
        'G',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Fogo no Altar',
        'fogo no altar',
        'Coral Esperança',
        'D  A/C#  Bm  G\nFogo no altar reacende a fe\nD  A  G\nMeu coracao arde\nBm  G  D\nTeu nome e exaltado\nA  G  D\nVou te adorar',
        'D',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Trono de Luz',
        'trono de luz',
        'Ministério Aurora',
        'A  E/G#  F#m  D\nTrono de luz ilumina o meu ser\nA  E  D\nEu quero te servir\nF#m  D  A\nTeu reino me governa\nE  D  A\nVivo para ti',
        'A',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Jardim de Adoração',
        'jardim de adoracao',
        'Vozes do Caminho',
        'E  B/D#  C#m  A\nJardim de adoracao floresce em mim\nE  B  A\nTeu perfume vem\nC#m  A  E\nMinha vida e oferta\nB  A  E\nLouvo ao Senhor',
        'E',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Novo Cântico',
        'novo cantico',
        'Harpa Viva',
        'F  C/E  Dm  Bb\nNovo cantico nasce do teu amor\nF  C  Bb\nTeu nome exaltarei\nDm  Bb  F\nMinha voz te celebra\nC  Bb  F\nPara sempre cantarei',
        'F',
        'E A D G B E',
        1,
        'Louvor'
      ),
      (
        'Mãos Abertas',
        'maos abertas',
        'Louvor da Graça',
        'C  G/B  Am  F\nMaos abertas para receber\nC  G  F\nTeu cuidado vem\nAm  F  C\nTudo entrego a ti\nG  F  C\nMeu coração tambem',
        'C',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Caminho e Vida',
        'caminho e vida',
        'Coral Esperança',
        'G  D/F#  Em  C\nCaminho e vida, verdade e luz\nG  D  C\nMeu Cristo e Rei\nEm  C  G\nEu sigo teus passos\nD  C  G\nPara sempre viverei',
        'G',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Deus de Aliança',
        'deus de alianca',
        'Ministério Aurora',
        'D  A/C#  Bm  G\nDeus de alianca, fiel em todo tempo\nD  A  G\nEm ti confiarei\nBm  G  D\nTeu amor me firma\nA  G  D\nEm paz descansarei',
        'D',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Brisa da Manhã',
        'brisa da manha',
        'Vozes do Caminho',
        'A  E/G#  F#m  D\nBrisa da manha toca meu ser\nA  E  D\nTua voz me chama\nF#m  D  A\nEu quero te buscar\nE  D  A\nCom alegria e fe',
        'A',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Santos Unidos',
        'santos unidos',
        'Harpa Viva',
        'C  G/B  Am  F\nSantos unidos em um so louvor\nC  G  F\nNome exaltado\nAm  F  C\nCom um só coracao\nG  F  C\nTeu reino e celebrado',
        'C',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Celebração da Graça',
        'celebracao da graca',
        'Louvor da Graça',
        'G  D/F#  Em  C\nCelebracao da graca, alegria sem fim\nG  D  C\nMeu louvor subira\nEm  C  G\nTeu amor me sustenta\nD  C  G\nMinha vida e cantar',
        'G',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Paz no Coração',
        'paz no coracao',
        'Coral Esperança',
        'E  B/D#  C#m  A\nPaz no coracao, presente do Senhor\nE  B  A\nMeu medo se foi\nC#m  A  E\nEm ti tenho abrigo\nB  A  E\nSou livre para amar',
        'E',
        'E A D G B E',
        null,
        'Adoração'
      ),
      (
        'Cruz que Salva',
        'cruz que salva',
        'Ministério Aurora',
        'Em  C  G  D\nCruz que salva, sinal de perdão\nEm  C  D\nNova vida em mim\nG  D  Em\nTeu amor e fundamento\nC  D  G\nSempre vou seguir',
        'Em',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Luz que Guia',
        'luz que guia',
        'Vozes do Caminho',
        'D  A/C#  Bm  G\nLuz que guia meus passos\nD  A  G\nEm ti confiarei\nBm  G  D\nEm toda tempestade\nA  G  D\nTu es fiel',
        'D',
        'E A D G B E',
        null,
        'Louvor'
      ),
      (
        'Vitória em Cristo',
        'vitoria em cristo',
        'Harpa Viva',
        'A  E/G#  F#m  D\nVitoria em Cristo e minha canção\nA  E  D\nMeu Salvador\nF#m  D  A\nTeu nome e exaltado\nE  D  A\nEm todo lugar',
        'A',
        'E A D G B E',
        null,
        'Hinos'
      ),
      (
        'Amor que Restaura',
        'amor que restaura',
        'Louvor da Graça',
        'C  G/B  Am  F\nAmor que restaura o coracao\nC  G  F\nRenova meu ser\nAm  F  C\nTeu cuidado me alcança\nG  F  C\nPosso renascer',
        'C',
        'E A D G B E',
        null,
        'Adoração'
      )
  ) as t(title, title_search, artist_name, lyrics_chords, original_key, tuning, capo, category)
)
insert into public.songs (
  title,
  title_search,
  artist_id,
  lyrics_chords,
  original_key,
  tuning,
  capo,
  category
)
select
  sd.title,
  sd.title_search,
  a.id,
  sd.lyrics_chords,
  sd.original_key,
  sd.tuning,
  sd.capo,
  sd.category
from songs_data sd
join public.artists a on a.name = sd.artist_name
where not exists (
  select 1 from public.songs s
  where s.title_search = sd.title_search
    and s.artist_id = a.id
);
