/* Uganda Smart Learning — SAMPLE seed content.
   Everything here is demo material written for this prototype. It is NOT official NCDC syllabus text,
   NOT a UNEB paper and NOT an official marking scheme. Replace through the Admin dashboard. */
(function (r) {
  const SAMPLE = 'Sample content (not official)';
  const classes = [
    { id: 'S1', name: 'Senior One', level: 'Lower secondary', focus: 'Introduction to the lower secondary curriculum' },
    { id: 'S2', name: 'Senior Two', level: 'Lower secondary', focus: 'Building foundational knowledge and skills' },
    { id: 'S3', name: 'Senior Three', level: 'Lower secondary', focus: 'Developing deeper subject understanding' },
    { id: 'S4', name: 'Senior Four', level: 'UCE', focus: 'UCE candidate preparation and revision' },
    { id: 'S5', name: 'Senior Five', level: 'Advanced', focus: 'Advanced secondary subjects and concepts' },
    { id: 'S6', name: 'Senior Six', level: 'UACE', focus: 'UACE candidate preparation and revision' }
  ];
  // Subject catalogue is configurable in Admin → Catalogue. This is only a starting point.
  const subjects = [
    { id: 'math', name: 'Mathematics', classes: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
    { id: 'eng', name: 'English Language', classes: ['S1', 'S2', 'S3', 'S4'] },
    { id: 'bio', name: 'Biology', classes: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
    { id: 'phy', name: 'Physics', classes: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
    { id: 'chem', name: 'Chemistry', classes: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
    { id: 'hist', name: 'History', classes: ['S1', 'S2', 'S3', 'S4'] },
    { id: 'geo', name: 'Geography', classes: ['S1', 'S2', 'S3', 'S4'] },
    { id: 'econ', name: 'Economics', classes: ['S5', 'S6'] },
    { id: 'gp', name: 'General Paper', classes: ['S5', 'S6'] }
  ];
  const orgs = [
    { id: 'o_usl', name: 'Uganda Smart Learning (sample content)' },
    { id: 'o_school', name: 'Sample School (demo teacher)' },
    { id: 'o_uneb', name: 'UNEB (add only authorised papers)' },
    { id: 'o_ncdc', name: 'NCDC (add only authorised sample assessments)' }
  ];

  const L = (id, cls, subject, topic, subtopic, title, objectives, notes, example, quiz) => ({
    id, cls, subject, topic, subtopic, title, objectives, notes, example, quiz,
    status: 'published', review: 'sample', source: SAMPLE, permission: 'Own sample content', submittedBy: 'system'
  });

  const lessons = [
    L('s1-math-sets', 'S1', 'math', 'Sets', 'Basic set ideas', 'Introduction to sets',
      ['Define a set and its elements', 'Use set notation', 'Find the union and intersection of two sets'],
      '<p>A <b>set</b> is a well-defined collection of objects. The objects are called <b>elements</b> (or members). We list them inside curly brackets, for example <b>A = {1, 2, 3, 4}</b>.</p><h3>Notation</h3><ul><li>3 ∈ A means "3 is an element of A".</li><li>n(A) is the number of elements in A.</li><li>A ∪ B (union) contains everything that is in A or in B or in both.</li><li>A ∩ B (intersection) contains only the elements found in both sets.</li><li>∅ is the empty set, which has no elements.</li></ul><div class="box">Useful formula: n(A ∪ B) = n(A) + n(B) − n(A ∩ B)</div>',
      'Let A = {1, 2, 3, 4} and B = {3, 4, 5}. Then A ∪ B = {1, 2, 3, 4, 5} and A ∩ B = {3, 4}. Check: n(A ∪ B) = 4 + 3 − 2 = 5.',
      [{ q: 'How many elements are in {a, b, c, d}?', o: ['3', '4', '5', '6'], a: 1 },
       { q: 'If A = {1, 2, 3} and B = {2, 3, 4}, what is A ∩ B?', o: ['{1, 2, 3, 4}', '{2, 3}', '{1, 4}', '{3}'], a: 1 },
       { q: 'Which symbol means "is an element of"?', o: ['∪', '∩', '∈', '∅'], a: 2 }]),
    L('s1-bio-cell', 'S1', 'bio', 'Cells', 'Cell structure', 'The cell: the unit of life',
      ['Name the main parts of a cell', 'State the function of each part', 'Compare plant and animal cells'],
      '<p>All living things are made of <b>cells</b>. Most cells have three basic parts:</p><ul><li><b>Cell membrane</b> – controls what enters and leaves the cell.</li><li><b>Cytoplasm</b> – jelly-like fluid where many chemical reactions happen.</li><li><b>Nucleus</b> – controls the activities of the cell and contains the genetic material.</li></ul><h3>Plant cells also have</h3><ul><li><b>Cell wall</b> – a rigid layer that supports the cell.</li><li><b>Chloroplasts</b> – contain chlorophyll for photosynthesis.</li><li>A large <b>vacuole</b> filled with cell sap.</li></ul>',
      'A cell from a leaf has chloroplasts and a cell wall, so it is a plant cell. A cheek cell has neither, so it is an animal cell.',
      [{ q: 'Which part controls the activities of the cell?', o: ['Cytoplasm', 'Nucleus', 'Cell wall', 'Vacuole'], a: 1 },
       { q: 'Where does photosynthesis take place in a plant cell?', o: ['Nucleus', 'Cell membrane', 'Chloroplast', 'Cytoplasm'], a: 2 },
       { q: 'Which structure is found in plant cells but not animal cells?', o: ['Cell membrane', 'Nucleus', 'Cytoplasm', 'Cell wall'], a: 3 }]),
    L('s2-chem-states', 'S2', 'chem', 'States of matter', 'Particles and changes of state', 'Solids, liquids and gases',
      ['Describe particle arrangement in the three states', 'Name the changes of state'],
      '<p>Matter exists mainly as a <b>solid</b>, a <b>liquid</b> or a <b>gas</b>.</p><ul><li><b>Solid</b> – particles packed closely in fixed positions; they only vibrate.</li><li><b>Liquid</b> – particles close together but able to slide past each other.</li><li><b>Gas</b> – particles far apart and moving freely in all directions.</li></ul><h3>Changes of state</h3><ul><li>Melting: solid → liquid. Freezing: liquid → solid.</li><li>Boiling/evaporation: liquid → gas. Condensation: gas → liquid.</li><li>Sublimation: solid → gas directly (or the reverse).</li></ul>',
      'Heating ice turns it to water (melting). Heating the water further turns it to steam (boiling).',
      [{ q: 'What is the change from solid directly to gas called?', o: ['Melting', 'Sublimation', 'Condensation', 'Freezing'], a: 1 },
       { q: 'Particles in a gas are…', o: ['packed in fixed positions', 'close but sliding', 'far apart and moving freely', 'not moving at all'], a: 2 },
       { q: 'Liquid to solid is called…', o: ['Boiling', 'Melting', 'Condensation', 'Freezing'], a: 3 }]),
    L('s3-phy-speed', 'S3', 'phy', 'Motion', 'Speed and velocity', 'Speed and velocity',
      ['Calculate speed from distance and time', 'Distinguish speed from velocity'],
      '<p><b>Speed</b> tells us how fast an object moves: <b>speed = distance ÷ time</b>. The SI unit is metres per second (m/s); km/h is also common.</p><p><b>Velocity</b> is speed in a stated direction, so velocity is a vector quantity while speed is a scalar.</p>',
      'A boda-boda rider covers 150 m in 30 s. Speed = 150 ÷ 30 = 5 m/s.',
      [{ q: 'A car travels 240 km in 3 hours. What is its average speed?', o: ['60 km/h', '70 km/h', '80 km/h', '90 km/h'], a: 2 },
       { q: 'What is the SI unit of speed?', o: ['km/h', 'm/s', 'm', 's'], a: 1 },
       { q: 'What does velocity have that speed does not?', o: ['Direction', 'Units', 'Time', 'Distance'], a: 0 }]),
    L('s4-math-quad', 'S4', 'math', 'Quadratic equations', 'Solving by factorising and formula', 'Solving quadratic equations',
      ['Solve quadratics by factorising', 'Use the quadratic formula', 'Use the discriminant'],
      '<p>A quadratic equation has the form <b>ax² + bx + c = 0</b>.</p><h3>Factorising</h3><p>Write the expression as a product of two brackets and set each bracket to zero.</p><h3>Formula</h3><div class="box">x = (−b ± √(b² − 4ac)) ÷ 2a</div><p>The <b>discriminant</b> b² − 4ac tells us the roots: positive → two different real roots; zero → one repeated root; negative → no real roots.</p>',
      'Solve x² − 5x + 6 = 0. Factorise: (x − 2)(x − 3) = 0, so x = 2 or x = 3.',
      [{ q: 'Solve x² − 5x + 6 = 0.', o: ['x = 2 or 3', 'x = −2 or −3', 'x = 1 or 6', 'x = 5 or 1'], a: 0 },
       { q: 'What is the discriminant of x² + 2x + 1?', o: ['0', '4', '8', '−4'], a: 0 },
       { q: 'Solve x² − 9 = 0.', o: ['x = 3 only', 'x = ±3', 'x = ±9', 'x = 0'], a: 1 }]),
    L('s4-bio-photo', 'S4', 'bio', 'Photosynthesis', 'Process and requirements', 'Photosynthesis',
      ['State the word and chemical equation', 'List the conditions required', 'Explain what happens to the products'],
      '<p><b>Photosynthesis</b> is the process by which green plants make glucose from carbon dioxide and water using light energy absorbed by chlorophyll.</p><div class="box">carbon dioxide + water → glucose + oxygen (light, chlorophyll)<br>6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂</div><p>It takes place in <b>chloroplasts</b>. Excess glucose is converted to starch for storage; oxygen is released through the stomata.</p>',
      'A plant kept in the dark cannot photosynthesise, so a leaf tested for starch after several days in darkness gives a negative result.',
      [{ q: 'Which gas is absorbed by plants during photosynthesis?', o: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], a: 2 },
       { q: 'Where does photosynthesis take place?', o: ['Mitochondria', 'Chloroplasts', 'Nucleus', 'Ribosomes'], a: 1 },
       { q: 'In what form is excess glucose stored in plants?', o: ['Protein', 'Fat', 'Starch', 'Glycogen'], a: 2 }]),
    L('s4-phy-elec', 'S4', 'phy', 'Electricity', "Ohm's law and resistors", "Ohm's law and resistance",
      ["State Ohm's law", 'Calculate current, voltage or resistance', 'Add resistances in series'],
      "<p><b>Ohm's law</b>: the current through a conductor is proportional to the voltage across it, provided temperature stays constant.</p><div class=\"box\">V = I × R &nbsp;(V in volts, I in amperes, R in ohms Ω)</div><p>For resistors in <b>series</b> the total resistance is the sum: R = R₁ + R₂ + …</p>",
      'A 4 Ω resistor is connected across a 12 V supply. I = V ÷ R = 12 ÷ 4 = 3 A.',
      [{ q: 'What current flows when 6 V is applied across 3 Ω?', o: ['1 A', '2 A', '3 A', '18 A'], a: 1 },
       { q: 'What is the unit of resistance?', o: ['Volt', 'Ampere', 'Ohm', 'Watt'], a: 2 },
       { q: 'Two resistors of 2 Ω and 3 Ω are in series. Total resistance?', o: ['1 Ω', '1.2 Ω', '5 Ω', '6 Ω'], a: 2 }]),
    L('s4-chem-acids', 'S4', 'chem', 'Acids, bases and salts', 'pH and neutralisation', 'Acids, bases and salts',
      ['Use the pH scale', 'Describe neutralisation', 'Write a simple neutralisation equation'],
      '<p>The <b>pH scale</b> runs from 0 to 14: below 7 is acidic, 7 is neutral, above 7 is alkaline. Acids turn blue litmus red; alkalis turn red litmus blue.</p><p><b>Neutralisation</b>: acid + base → salt + water.</p><div class="box">HCl + NaOH → NaCl + H₂O</div>',
      'Hydrochloric acid reacts with sodium hydroxide to give sodium chloride (table salt) and water.',
      [{ q: 'What is the pH of a neutral solution?', o: ['0', '7', '10', '14'], a: 1 },
       { q: 'HCl + NaOH produces…', o: ['NaCl and water', 'NaOH and water', 'Cl₂ and Na', 'NaCl and hydrogen'], a: 0 },
       { q: 'Blue litmus paper in acid turns…', o: ['green', 'yellow', 'red', 'stays blue'], a: 2 }]),
    L('s5-phy-kin', 'S5', 'phy', 'Kinematics', 'Equations of uniformly accelerated motion', 'Equations of motion',
      ['Apply v = u + at, s = ut + ½at² and v² = u² + 2as'],
      '<p>For motion in a straight line with <b>constant acceleration a</b>, initial velocity <b>u</b>, final velocity <b>v</b>, time <b>t</b> and displacement <b>s</b>:</p><div class="box">v = u + at<br>s = ut + ½at²<br>v² = u² + 2as</div><p>Choose the equation that contains the three quantities you know and the one you want.</p>',
      'A car starts from rest (u = 0) with a = 2 m/s² for 5 s. v = 0 + 2×5 = 10 m/s and s = ½×2×5² = 25 m.',
      [{ q: 'u = 2 m/s, a = 3 m/s², t = 4 s. Find v.', o: ['10 m/s', '12 m/s', '14 m/s', '16 m/s'], a: 2 },
       { q: 'u = 0, a = 4 m/s², t = 3 s. Find s.', o: ['12 m', '18 m', '24 m', '36 m'], a: 1 },
       { q: 'u = 0, a = 2 m/s², s = 9 m. Find v.', o: ['3 m/s', '6 m/s', '9 m/s', '18 m/s'], a: 1 }]),
    L('s5-math-diff', 'S5', 'math', 'Differentiation', 'Differentiating powers of x', 'Introduction to differentiation',
      ['Differentiate polynomials', 'Find the gradient of a curve at a point'],
      '<p>The <b>derivative</b> dy/dx gives the gradient of a curve. For powers of x:</p><div class="box">If y = xⁿ then dy/dx = n·xⁿ⁻¹</div><p>The derivative of a constant is 0, and each term of a polynomial is differentiated separately.</p>',
      'y = 3x⁴ − 2x² + 5 gives dy/dx = 12x³ − 4x. At x = 1 the gradient is 12 − 4 = 8.',
      [{ q: 'Differentiate y = x³.', o: ['x²', '3x²', '3x', 'x⁴/4'], a: 1 },
       { q: 'Differentiate y = 5x.', o: ['5', '5x', 'x', '0'], a: 0 },
       { q: 'What is the derivative of a constant?', o: ['1', 'The constant', '0', 'x'], a: 2 }]),
    L('s6-math-integ', 'S6', 'math', 'Integration', 'Integrating powers of x', 'Introduction to integration',
      ['Integrate powers of x', 'Evaluate a definite integral'],
      '<p>Integration reverses differentiation:</p><div class="box">∫ xⁿ dx = xⁿ⁺¹ ÷ (n + 1) + C &nbsp;(n ≠ −1)</div><p>For a <b>definite integral</b> from a to b, integrate, then subtract the value at a from the value at b. The constant C cancels out.</p>',
      '∫₀² 3x² dx = [x³] from 0 to 2 = 8 − 0 = 8.',
      [{ q: '∫ 2x dx =', o: ['x² + C', '2x² + C', 'x + C', '2 + C'], a: 0 },
       { q: '∫₀¹ x dx =', o: ['1', '1/2', '2', '0'], a: 1 },
       { q: '∫₀² 3x² dx =', o: ['4', '6', '8', '12'], a: 2 }]),
    L('s6-chem-equil', 'S6', 'chem', 'Chemical equilibrium', "Le Chatelier's principle", 'Chemical equilibrium',
      ['Describe dynamic equilibrium', "Apply Le Chatelier's principle"],
      "<p>In a reversible reaction at <b>dynamic equilibrium</b> the forward and reverse reaction rates are equal, so concentrations stay constant.</p><p><b>Le Chatelier's principle</b>: if a change is imposed on a system at equilibrium, the position shifts to oppose the change.</p><ul><li>Raising pressure favours the side with fewer moles of gas.</li><li>A catalyst speeds up both directions equally and does <b>not</b> change the position of equilibrium.</li></ul>",
      'N₂ + 3H₂ ⇌ 2NH₃: 4 moles of gas on the left and 2 on the right, so higher pressure shifts the equilibrium to the right.',
      [{ q: 'What effect does a catalyst have on the position of equilibrium?', o: ['Shifts right', 'Shifts left', 'None', 'Stops the reaction'], a: 2 },
       { q: 'At equilibrium, the forward rate is…', o: ['greater than the reverse', 'less than the reverse', 'equal to the reverse', 'zero'], a: 2 },
       { q: 'Increasing pressure on N₂ + 3H₂ ⇌ 2NH₃ shifts the position…', o: ['to the right', 'to the left', 'not at all', 'to the left then right'], a: 0 }]),
    L('s6-bio-enzymes', 'S6', 'bio', 'Enzymes', 'Properties and factors', 'Enzymes',
      ['State what enzymes are', 'Explain the effect of temperature and pH'],
      '<p><b>Enzymes</b> are biological catalysts made of protein. Each enzyme has an <b>active site</b> whose shape fits a specific substrate (lock-and-key model).</p><ul><li>Rate rises with temperature up to an optimum.</li><li>Above the optimum the enzyme is <b>denatured</b>: the active site changes shape and the substrate no longer fits.</li><li>Each enzyme works best at an optimum pH.</li></ul>',
      'Amylase in saliva breaks starch down to maltose. Boiling it first destroys its activity.',
      [{ q: 'Enzymes are made of…', o: ['Lipids', 'Proteins', 'Carbohydrates', 'Minerals'], a: 1 },
       { q: 'What happens to an enzyme at very high temperature?', o: ['It works faster', 'It is denatured', 'It becomes a substrate', 'Nothing'], a: 1 },
       { q: 'The substrate binds to the…', o: ['active site', 'cell wall', 'nucleus', 'membrane'], a: 0 }])
  ];

  const M = (id, topic, marks, text, o, a) => ({ id, type: 'mcq', topic, marks, text, o, a });
  const S = (id, topic, marks, text, model) => ({ id, type: 'struct', topic, marks, text, model });
  const P = (o) => Object.assign({
    level: '', org: 'Uganda Smart Learning (sample content)', category: 'AI-generated practice', hasGuide: true,
    verified: false, permission: 'Own sample content', reviewer: 'Not yet human-verified', status: 'published',
    submittedBy: 'system', createdAt: 0, instructions: 'Answer all questions. This is sample practice material, not an official UNEB paper.'
  }, o);

  const papers = [
    P({ id: 'p-s4-math-1', title: 'SAMPLE Mathematics Practice – Paper 1', cls: 'S4', subject: 'math', year: 2026, paperNo: 1, duration: 20,
      questions: [
        M('q1', 'Quadratic equations', 2, 'Solve x² − 7x + 12 = 0.', ['x = 3 or 4', 'x = −3 or −4', 'x = 2 or 6', 'x = 1 or 12'], 0),
        M('q2', 'Algebra', 2, 'Simplify 3(x + 2) − 2x.', ['x + 6', '5x + 6', 'x + 2', '5x + 2'], 0),
        M('q3', 'Sets', 2, 'If A = {1, 2, 3} and B = {3, 4}, find A ∪ B.', ['{3}', '{1, 2, 3, 4}', '{1, 2, 4}', '{1, 2, 3}'], 1),
        M('q4', 'Indices', 2, 'Evaluate 2³ × 2².', ['10', '32', '64', '12'], 1),
        M('q5', 'Coordinate geometry', 2, 'Find the gradient of the line through (0, 1) and (2, 5).', ['1', '2', '3', '4'], 1),
        S('q6', 'Quadratic equations', 4, 'Solve 2x² + 3x − 2 = 0.', 'Factorise: (2x − 1)(x + 2) = 0, so x = 1/2 or x = −2.\nCheck x = −2: 2(4) − 6 − 2 = 0 ✓.'),
        S('q7', 'Quadratic equations', 3, 'A rectangle has length (x + 3) cm and width x cm. Its area is 40 cm². Form and solve an equation to find x.', 'x(x + 3) = 40 → x² + 3x − 40 = 0 → (x + 8)(x − 5) = 0.\nx cannot be negative, so x = 5 cm (length 8 cm). Check: 5 × 8 = 40 ✓.')
      ] }),
    P({ id: 'p-s4-bio-1', title: 'SAMPLE Biology Practice – Paper 1 (objective)', cls: 'S4', subject: 'bio', year: 2026, paperNo: 1, duration: 10,
      questions: [
        M('q1', 'Photosynthesis', 1, 'Which organelle is the site of photosynthesis?', ['Mitochondrion', 'Chloroplast', 'Nucleus', 'Ribosome'], 1),
        M('q2', 'Diffusion and osmosis', 1, 'Movement of water across a semi-permeable membrane from a dilute to a concentrated solution is called…', ['Diffusion', 'Osmosis', 'Active transport', 'Transpiration'], 1),
        M('q3', 'Transport in animals', 1, 'Which blood cells carry oxygen?', ['White blood cells', 'Platelets', 'Red blood cells', 'Plasma'], 2),
        M('q4', 'Nutrition', 1, 'Which enzyme in saliva digests starch?', ['Pepsin', 'Lipase', 'Amylase', 'Trypsin'], 2),
        M('q5', 'Plant structure', 1, 'A main function of roots is to…', ['make food', 'absorb water and mineral salts', 'attract insects', 'store oxygen'], 1)
      ] }),
    P({ id: 'p-s4-bio-2', title: 'SAMPLE Biology Practice – Paper 2 (structured)', cls: 'S4', subject: 'bio', year: 2026, paperNo: 2, duration: 20,
      questions: [
        S('q1', 'Diffusion and osmosis', 3, 'Define diffusion and give one example in living organisms.', 'Diffusion is the net movement of particles from a region of higher concentration to a region of lower concentration, down a concentration gradient.\nExample: oxygen moving from the alveoli into the blood.'),
        S('q2', 'Photosynthesis', 4, 'Write the word equation for photosynthesis and name two conditions required.', 'carbon dioxide + water → glucose + oxygen (in light, using chlorophyll).\nAny two: light, chlorophyll, carbon dioxide, water.'),
        S('q3', 'Enzymes', 3, 'Explain why enzymes stop working at very high temperatures.', 'High temperature changes the shape of the active site (denaturation), so the substrate no longer fits and the enzyme cannot catalyse the reaction.')
      ] }),
    P({ id: 'p-s6-phy-1', title: 'SAMPLE Physics Practice – Paper 1', cls: 'S6', subject: 'phy', year: 2026, paperNo: 1, duration: 15,
      questions: [
        M('q1', 'Kinematics', 2, 'A car accelerates from rest at 2 m/s² for 5 s. Its final velocity is…', ['5 m/s', '10 m/s', '15 m/s', '25 m/s'], 1),
        M('q2', 'Kinematics', 2, 'The distance travelled by the car in that time is…', ['10 m', '20 m', '25 m', '50 m'], 2),
        M('q3', 'Dynamics', 1, 'The SI unit of force is the…', ['joule', 'newton', 'watt', 'pascal'], 1),
        M('q4', 'Electricity', 2, 'A 4 Ω resistor across a 12 V supply carries a current of…', ['0.33 A', '3 A', '8 A', '48 A'], 1),
        M('q5', 'Dynamics', 1, 'Which of these is a vector quantity?', ['Mass', 'Speed', 'Energy', 'Velocity'], 3),
        S('q6', 'Dynamics', 4, 'A body of mass 2 kg accelerates at 3 m/s². Calculate the resultant force and state Newton\'s second law.', 'F = ma = 2 × 3 = 6 N.\nNewton\'s second law: the resultant force on a body is proportional to its rate of change of momentum; for constant mass F = ma.')
      ] }),
    P({ id: 'p-s4-chem-1-mock', title: 'SAMPLE Chemistry Teacher Mock – Paper 1 (no marking guide)', cls: 'S4', subject: 'chem', year: 2025, paperNo: 1, duration: 8,
      org: 'Sample School (demo teacher)', category: 'Teacher-created assessment', hasGuide: false, permission: 'Own sample content',
      reviewer: 'Reviewed (sample data)', verified: true,
      questions: [
        { id: 'q1', type: 'mcq', topic: 'Acids, bases and salts', marks: 1, text: 'What is the pH of pure water at 25 °C?', o: ['1', '7', '10', '14'] },
        { id: 'q2', type: 'mcq', topic: 'Atomic structure', marks: 1, text: 'The atomic number of an element is the number of its…', o: ['neutrons', 'protons', 'electrons plus neutrons', 'shells'] },
        { id: 'q3', type: 'mcq', topic: 'Acids, bases and salts', marks: 1, text: 'Which gas forms when zinc reacts with dilute hydrochloric acid?', o: ['Oxygen', 'Carbon dioxide', 'Hydrogen', 'Chlorine'] }
      ] }),
    P({ id: 'p-s6-chem-1-pending', title: 'SAMPLE Chemistry Contributor Submission – Paper 1', cls: 'S6', subject: 'chem', year: 2026, paperNo: 1, duration: 6,
      org: 'Sample School (demo teacher)', category: 'Teacher-created assessment', status: 'pending', verified: false, reviewer: 'Pending review',
      submittedBy: 'teacher@usl.demo', permission: 'Own sample content',
      questions: [
        M('q1', 'Chemical equilibrium', 1, 'A catalyst changes the position of equilibrium.', ['True', 'False'], 1),
        M('q2', 'Chemical equilibrium', 1, 'At dynamic equilibrium the forward and reverse rates are…', ['equal', 'zero', 'different', 'increasing'], 0)
      ] })
  ];

  r.USL_DATA = { classes, subjects, orgs, lessons, papers, SAMPLE };
})(typeof window !== 'undefined' ? window : globalThis);
