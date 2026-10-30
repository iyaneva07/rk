const books = [
  {
    id: 'stasi-state-or-socialist-paradise', category: 'history', pages: 243, priceCents: 1100,
    isbn: '978-619-93996-0-6', dimensionsMm: '176х112', images: ['ddr_korica_predna.png', 'ddr_korica_zadna.png', ...Array.from({ length: 10 }, (_, index) => `assets/stasi-page-${String(index + 1).padStart(2, '0')}.webp`)], epub: 'assets/Stasi_durzhava_ili_sozialisticheski_rai.epub',
    bg: {
      title: 'Щази държава или социалистически рай?', author: 'Бруни де ла Моте и Джон Грийн', cover: ['КАПИТАЛъТ том 1'], top: '01', bottom: 'Карл Маркс',
      description: [
        'Много е било писано за това колко е била лоша Германската демократична република: народ, затворен от стена, държан в подчинение от веждесъщия апарат на Щазито. Подобни описания се основават до голяма степен на предубеденост, незнание и на ясно осъзната враждебност. Тази книга е опит да се представи една по-безпристрастна оценка и да се разгледа социализмът в ГДР от гледна точка на поуките, които можем да си извадим от него. Авторите, без да пренебрегват истинските недостатъци на източногерманското общество, подчертават множеството му положителни страни и показват, че едно по-различно общество е възможно.',
        'Тази книга е допълнено и много разширено издание на тяхната брошура, публикувана за пръв път през 2009 година. Авторите са описали по-подробно зараждането на ГДР като отделна държава, начина на функциониране на нейното общество, както и какви са били определящите за ежедневието на нейните граждани ценности.',
        'Добавен е и един цял нов раздел относно случилото се след Обединението, особено що се касае до икономиката. Въпреки че то е дало на източногерманците достъп до едно по-охолно общество, свободата да пътуват в цял свят и края на свръхцентрализираната политическа система, то е донесло със себе си и безработицата, обществения разпад и обезверяването, особено в някога проспериращите земеделски райони.'
      ]
    },
    en: {
      title: 'Stasi State or Socialist Paradise?', author: 'Bruni de la Motte and John Green', cover: ['Capital vol 1'], top: '01', bottom: 'Karl Marx',
      description: [
        'Much has been written about how awful the German Democratic Republic supposedly was: a people imprisoned by a wall and subjugated by an omnipresent Stasi security apparatus. Such descriptions are based largely on prejudice, ignorance and wilful animosity. This book is an attempt to provide a more balanced evaluation and to examine GDR-style socialism in terms of what we can learn from it. The authors, while not ignoring the real deficiencies of GDR society, emphasise the many aspects that were positive, and demonstrate that alternative ways of organising society are possible.',
        'This volume is an updated and much expanded edition of the authors&#39; booklet first published in 2009. They have added more detail on how the GDR came into being as a separate state, about how society functioned and what values determined the every-day life of its citizens.',
        'There is also a whole new section on what happened in the aftermath of unification, particularly to the economy. While unification brought East Germans access to a more affluent society, freedom to travel throughout the world and the end to an over-centralised political system, it also brought with it unemployment, social breakdown and loss of hope, particularly in the once thriving rural areas.'
      ]
    }
  }
];
