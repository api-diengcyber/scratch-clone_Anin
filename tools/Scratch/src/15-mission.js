// ============================================================
// MISI LEVEL, CEK OTOMATIS, DAN POIN
// ============================================================

(function initMission() {

  // ---------- PENGATURAN POIN ----------
  const POINTS_BASE  = 30;   // poin dasar setiap level selesai
  const POINTS_BONUS = 10;   // bonus jika selesai di percobaan pertama

  // ---------- DATA MISI ----------
  // Tiap level: judul, tantangan, petunjuk, dan daftar syarat (goals) untuk cek otomatis.
  // Level tanpa goals sementara memakai tombol "Tandai selesai".
  const MOTION = ["move_steps","turn_right","turn_left","goto_random","goto_xy","glide_random","glide_xy",
    "point_direction","point_towards","change_x","set_x","change_y","set_y","if_edge","set_rotation_style"];
  const LOOKS = ["say_for_secs","say","think_for_secs","think","switch_costume","next_costume","change_size",
    "set_size","show","hide","change_graphic_effect","set_graphic_effect","clear_graphic_effects",
    "go_to_front","go_back_layers","switch_backdrop","next_backdrop"];
  const SOUND = ["start_sound","play_sound_until_done"];

  // ---- helper analisis blok ----
  function flatBlocks(blocks, out) {
    out = out || [];
    (blocks || []).forEach(b => { out.push(b); (b.branches || []).forEach(br => flatBlocks(br, out)); });
    return out;
  }
  function stacksInfo() {
    return state.stacks
      .filter(s => s && s.blocks && s.blocks.length)
      .map(s => {
        const all = flatBlocks(s.blocks);
        return { hat: s.blocks[0].type, blocks: all, types: all.map(b => b.type) };
      });
  }
  const hasAny = (info, list) => info.types.some(t => list.includes(t));
  const flagStacks = () => stacksInfo().filter(i => i.hat === "when_flag_clicked");
  const someFlag = (fn) => flagStacks().some(fn);
  function textSequence(info) {
    const seq = [];
    info.types.forEach(t => {
      const c = t.startsWith("say") ? "S" : t.startsWith("think") ? "T" : null;
      if (c && seq[seq.length - 1] !== c) seq.push(c);
    });
    return seq;
  }

  const MISSIONS = {
    sd: {
      1: { title: "Halo Coding!", challenge: "Buat karakter menyapa saat bendera hijau diklik.",
        hint: "Ambil \"when 🚩 clicked\" dari Events, lalu \"say\" dari Looks, dan sambungkan di bawahnya.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Sambungkan blok \"say\" di bawahnya", test: () => someFlag(i => hasAny(i, ["say","say_for_secs"])) }
        ] },
      2: { title: "Karakter Bergerak", challenge: "Gerakkan karakter 10 langkah dan ubah arahnya.",
        hint: "Pakai \"move 10 steps\" dari Motion, lalu tambahkan \"turn\" untuk mengubah arah.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Pakai \"move 10 steps\" (isi angkanya 10)", test: () => someFlag(i => i.blocks.some(b => b.type === "move_steps" && Number(getBlockInputValue(b)) === 10)) },
          { text: "Ubah arah dengan \"turn\" atau \"point in direction\"", test: () => someFlag(i => hasAny(i, ["turn_right","turn_left","point_direction"])) }
        ] },
      3: { title: "Cerita Interaktif", challenge: "Buat karakter berbicara dan berpikir bergantian.",
        hint: "Susun say → think → say (atau think → say → think) dalam satu rangkaian.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Ada blok \"say\"", test: () => someFlag(i => hasAny(i, ["say","say_for_secs"])) },
          { text: "Ada blok \"think\"", test: () => someFlag(i => hasAny(i, ["think","think_for_secs"])) },
          { text: "Susun bergantian (say, think, say atau sebaliknya)", test: () => someFlag(i => textSequence(i).length >= 3) }
        ] },
      4: { title: "Suara Seru", challenge: "Tambahkan suara ketika karakter melakukan aksi.",
        hint: "Pasang blok dari Sound (misalnya \"start sound\") di rangkaian yang sama dengan blok gerak atau say.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Ada blok aksi (Motion atau Looks)", test: () => someFlag(i => hasAny(i, MOTION) || hasAny(i, LOOKS)) },
          { text: "Ada blok Sound di rangkaian yang sama", test: () => someFlag(i => (hasAny(i, MOTION) || hasAny(i, LOOKS)) && hasAny(i, SOUND)) }
        ] },
      5: { title: "Game Mini", challenge: "Buat game sederhana yang bisa dimainkan.",
        hint: "Pakai \"when key pressed\" atau \"when this sprite clicked\", lalu tambahkan blok gerak dan blok Looks.",
        goals: [
          { text: "Pakai blok event pemain (\"when key pressed\" atau \"when this sprite clicked\")", test: () => stacksInfo().some(i => ["when_key_pressed","when_sprite_clicked"].includes(i.hat)) },
          { text: "Event itu menggerakkan karakter (blok Motion)", test: () => stacksInfo().some(i => ["when_key_pressed","when_sprite_clicked"].includes(i.hat) && hasAny(i, MOTION)) },
          { text: "Ada blok Looks (say, think, ganti costume, dll.)", test: () => stacksInfo().some(i => hasAny(i, LOOKS)) }
        ] }
    },
    smp: {
      1: { title: "Event & Input", challenge: "Buat karakter bergerak menggunakan tombol panah." },
      2: { title: "Variabel Skor", challenge: "Buat skor yang bertambah saat pemain mendapat poin." },
      3: { title: "Percabangan", challenge: "Jika skor mencapai 5, tampilkan pesan kemenangan." },
      4: { title: "Perulangan", challenge: "Buat objek bergerak berulang tanpa menulis blok berkali-kali." },
      5: { title: "Game dengan Skor", challenge: "Buat game dengan skor, kondisi menang, dan tombol mulai." }
    },
    smak: {
      1: { title: "Algoritma", challenge: "Susun alur program dari input sampai output." },
      2: { title: "Kondisi & Operator", challenge: "Buat program yang memberikan output sesuai kondisi." },
      3: { title: "Looping", challenge: "Buat proses yang berjalan berulang sampai kondisi terpenuhi." },
      4: { title: "Variabel & Data", challenge: "Gunakan variabel untuk menyimpan dan menghitung data." },
      5: { title: "Project Akhir", challenge: "Buat game atau simulasi dengan beberapa fitur coding." }
    }
  };
  const GRADE_NAME = { sd: "SD", smp: "SMP", smak: "SMA/SMK" };

  // ---------- SYARAT CEK OTOMATIS: TASK JALUR BELAJAR (Tahap 1 • Pembelajaran 1) ----------
  // Judul, deskripsi, dan petunjuk tiap task ada di jalur-belajar.js. Di sini hanya syarat bloknya.
  const BACKDROP_BLOCKS = ["switch_backdrop", "next_backdrop"];
  const TEXT_BLOCKS = ["say", "say_for_secs", "think", "think_for_secs"];
  const countText = (i) => i.types.filter(t => TEXT_BLOCKS.includes(t)).length;
  const G_FLAG = { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 };
  // ---- pembantu untuk syarat task Tahap 1 (p2–p5) dan Tahap 2 Game (g1) ----
  const inside = (b) => { const o = []; (b.branches || []).forEach(br => flatBlocks(br, o)); return o; };
  const inVals = (b) => (b && b.element ? getOwnInputs(b.element).map(x => x.value) : []);
  const num = (b) => Number(getBlockInputValue(b));
  const ddVal = (b) => { const d = b && b.element ? getOwnDropdown(b.element) : null; return d ? d.dataset.value : null; };
  function reporterTypes(b) {                       // semua reporter/kondisi yang dipasang di slot milik blok b (rekursif)
    const out = [];
    const walk = (el) => getOwnInputs(el).forEach(inp => { const r = inp._reporterData; if (r) { out.push(r.type); if (r.element) walk(r.element); } });
    if (b && b.element) walk(b.element);
    return out;
  }
  const LOOPS = ["repeat", "forever", "repeat_until"];
  const IFS = ["if", "if_else"];
  const CMP = ["op_gt", "op_lt", "op_eq"];
  const SENSE_COND = ["key_pressed", "touching", "touching_color", "color_touching_color", "mouse_down"];
  const COLOR_FX = ["change_graphic_effect", "set_graphic_effect"];
  const SIZE_FX = ["change_size", "set_size"];
  const SAY = ["say", "say_for_secs", "think", "think_for_secs"];
  const hatStacks = (hat) => stacksInfo().filter(i => i.hat === hat);
  const keyStacks = () => hatStacks("when_key_pressed");
  const clickStacks = () => hatStacks("when_sprite_clicked");
  const recvStacks = () => hatStacks("when_receive");
  const distinctKeys = (list) => new Set(list.map(i => ddVal(i.blocks[0]))).size;
  const loopsOf = (i) => i.blocks.filter(b => LOOPS.includes(b.type));
  const loopHas = (i, fn) => loopsOf(i).some(l => fn(inside(l)));
  const anyOf = (arr, list) => arr.some(b => list.includes(b.type));
  const sendsMsg = (i) => i.blocks.filter(b => b.type === "broadcast" || b.type === "broadcast_wait").map(ddVal);
  const receivedFromFlag = (fn) => {                // ada broadcast di bendera, dan rangkaian "when I receive" pesan yang sama memenuhi fn
    const sent = new Set(); flagStacks().forEach(i => sendsMsg(i).forEach(m => sent.add(m)));
    return recvStacks().some(r => sent.has(ddVal(r.blocks[0])) && fn(r));
  };
  const G_RUN_FLAG = G_FLAG;
  const EDITOR_GOALS = {
    "p1-t1": [G_FLAG,
      { text: "Sambungkan blok \"move 10 steps\" di bawahnya", test: () => someFlag(i => i.types.includes("move_steps")) }],
    "p1-t2": [G_FLAG,
      { text: "Pakai blok \"switch backdrop\" atau \"next backdrop\"", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) }],
    "p1-t3": [G_FLAG,
      { text: "Pakai 2 blok bicara atau lebih (say / think)", test: () => someFlag(i => countText(i) >= 2) }],
    "p1-t4": [G_FLAG,
      { text: "Ada blok aksi (Motion atau Looks)", test: () => someFlag(i => hasAny(i, MOTION) || hasAny(i, LOOKS)) },
      { text: "Ada blok Sound di rangkaian yang sama", test: () => someFlag(i => (hasAny(i, MOTION) || hasAny(i, LOOKS)) && hasAny(i, SOUND)) }],
    "p1-t5": [G_FLAG,
      { text: "Ada blok gerak (Motion)", test: () => someFlag(i => hasAny(i, MOTION)) },
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) },
      { text: "Ada blok suara (Sound)", test: () => someFlag(i => hasAny(i, SOUND)) },
      { text: "Semuanya digabung dalam satu rangkaian", test: () => someFlag(i => hasAny(i, MOTION) && hasAny(i, BACKDROP_BLOCKS) && countText(i) >= 1 && hasAny(i, SOUND)) }]
    ,
    // ---------- Tahap 1 • Pembelajaran 2: Seni dari Komputer ----------
    "p2-t1": [G_FLAG,
      { text: "Ada minimal 2 blok color effect", test: () => someFlag(i => i.blocks.filter(b => COLOR_FX.includes(b.type)).length >= 2) },
      { text: "Ada blok \"wait\" di rangkaian yang sama", test: () => someFlag(i => hasAny(i, COLOR_FX) && i.types.includes("wait_secs")) }],
    "p2-t2": [G_FLAG,
      { text: "Ada blok \"turn\" di dalam blok \"repeat\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["turn_right", "turn_left"]))) },
      { text: "Putarannya sampai 360 derajat (ulangan × sudut)", test: () => someFlag(i => loopsOf(i).some(l => l.type === "repeat" && num(l) * inside(l).filter(b => b.type === "turn_right" || b.type === "turn_left").reduce((a, b) => a + Math.abs(num(b) || 0), 0) >= 360)) }],
    "p2-t3": [G_FLAG,
      { text: "Ada blok \"repeat\"", test: () => someFlag(i => loopsOf(i).length > 0) },
      { text: "Di dalam repeat ada blok color effect", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, COLOR_FX))) },
      { text: "Di dalam repeat ada blok \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) }],
    "p2-t4": [G_FLAG,
      { text: "Ada minimal 3 blok \"glide\"", test: () => someFlag(i => i.blocks.filter(b => b.type === "glide_xy").length >= 3) },
      { text: "Tujuan (x dan y) ketiganya berbeda", test: () => someFlag(i => new Set(i.blocks.filter(b => b.type === "glide_xy").map(b => inVals(b).slice(1, 3).join(","))).size >= 3) }],
    "p2-t5": [G_FLAG,
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada repeat berisi blok Motion", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, MOTION))) },
      { text: "Di dalam repeat juga ada blok color effect atau size", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, COLOR_FX.concat(SIZE_FX)))) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) }],

    // ---------- Tahap 1 • Pembelajaran 3: Memahat Tanah Liat ----------
    "p3-t1": [G_FLAG,
      { text: "Pakai blok \"when key pressed\"", test: () => keyStacks().length > 0 },
      { text: "Tersambung ke blok Motion", test: () => keyStacks().some(i => hasAny(i, MOTION)) }],
    "p3-t2": [G_FLAG,
      { text: "Ada 4 blok \"when key pressed\"", test: () => keyStacks().length >= 4 },
      { text: "Tombolnya berbeda-beda", test: () => distinctKeys(keyStacks()) >= 4 },
      { text: "Masing-masing tersambung ke blok Motion", test: () => keyStacks().filter(i => hasAny(i, MOTION)).length >= 4 }],
    "p3-t3": [G_FLAG,
      { text: "Pakai blok \"when this sprite clicked\"", test: () => clickStacks().length > 0 },
      { text: "Tersambung ke minimal 2 blok Looks", test: () => clickStacks().some(i => i.blocks.filter(b => LOOKS.includes(b.type)).length >= 2) }],
    "p3-t4": [G_FLAG,
      { text: "Satu tombol membesarkan karakter (angka positif)", test: () => keyStacks().some(i => i.blocks.some(b => b.type === "change_size" && num(b) > 0)) },
      { text: "Tombol lain mengecilkan karakter (angka negatif)", test: () => keyStacks().some(i => i.blocks.some(b => b.type === "change_size" && num(b) < 0)) },
      { text: "Kedua tombolnya berbeda", test: () => { const k = keyStacks(); const up = new Set(k.filter(i => i.blocks.some(b => b.type === "change_size" && num(b) > 0)).map(i => ddVal(i.blocks[0]))); const dn = new Set(k.filter(i => i.blocks.some(b => b.type === "change_size" && num(b) < 0)).map(i => ddVal(i.blocks[0]))); return [...up].some(a => [...dn].some(b => a !== b)); } }],
    "p3-t5": [G_FLAG,
      { text: "Ada 2 tombol berbeda yang menggerakkan karakter", test: () => distinctKeys(keyStacks().filter(i => hasAny(i, MOTION))) >= 2 },
      { text: "Ada klik sprite yang mengubah tampilan (Looks)", test: () => clickStacks().some(i => hasAny(i, LOOKS)) },
      { text: "Ada blok Sound di salah satu rangkaian", test: () => keyStacks().concat(clickStacks()).some(i => hasAny(i, SOUND)) }],

    // ---------- Tahap 1 • Pembelajaran 4: Mendesain Rumah ----------
    "p4-t1": [G_FLAG,
      { text: "Ada blok \"set variable\" di bawah bendera", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Nilainya ditampilkan (show variable, atau variabel di dalam say)", test: () => someFlag(i => i.types.includes("show_var") || i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("var_reporter"))) }],
    "p4-t2": [G_FLAG,
      { text: "Ada blok \"set variable\"", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Ada repeat berisi \"change variable\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["change_var"]))) },
      { text: "Hasilnya diucapkan dengan say (blok variabel di dalam say)", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("var_reporter"))) }],
    "p4-t3": [G_FLAG,
      { text: "Ada blok \"if\" di dalam repeat", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, IFS))) },
      { text: "Syaratnya dari Sensing (misalnya key pressed?)", test: () => someFlag(i => loopsOf(i).some(l => inside(l).some(b => IFS.includes(b.type) && reporterTypes(b).some(t => SENSE_COND.includes(t))))) },
      { text: "Di dalam if ada blok Motion atau Looks", test: () => someFlag(i => loopsOf(i).some(l => inside(l).some(b => IFS.includes(b.type) && (anyOf(inside(b), MOTION) || anyOf(inside(b), LOOKS))))) }],
    "p4-t4": [G_FLAG,
      { text: "Ada blok \"if-else\"", test: () => stacksInfo().some(i => i.types.includes("if_else")) },
      { text: "Syaratnya perbandingan (>, <, atau =)", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && reporterTypes(b).some(t => CMP.includes(t)))) },
      { text: "Kedua jalurnya berisi blok", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && (b.branches || []).length >= 2 && b.branches[0].length > 0 && b.branches[1].length > 0)) },
      { text: "Salah satunya mengganti latar", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && anyOf(inside(b), BACKDROP_BLOCKS))) }],
    "p4-t5": [G_FLAG,
      { text: "Ada blok \"set variable\"", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Ada repeat berisi \"change variable\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["change_var"]))) },
      { text: "Ada if yang membandingkan variabel", test: () => someFlag(i => i.blocks.some(b => IFS.includes(b.type) && reporterTypes(b).some(t => CMP.includes(t)) && reporterTypes(b).includes("var_reporter"))) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) }],

    // ---------- Tahap 1 • Pembelajaran 5: Animasi ala Peppa Pig ----------
    "p5-t1": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "Ada \"when I receive\" dengan pesan yang sama", test: () => receivedFromFlag(() => true) },
      { text: "Rangkaian itu berisi say atau think", test: () => receivedFromFlag(r => countText(r) >= 1) }],
    "p5-t2": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "\"when I receive\" berisi ganti latar", test: () => receivedFromFlag(r => hasAny(r, BACKDROP_BLOCKS)) },
      { text: "Ada say for seconds atau wait", test: () => receivedFromFlag(r => r.types.includes("say_for_secs") || r.types.includes("wait_secs")) }],
    "p5-t3": [G_FLAG,
      { text: "Ada blok \"ask and wait\"", test: () => someFlag(i => i.types.includes("ask_wait")) },
      { text: "Ada say yang memakai \"join\"", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("op_join"))) },
      { text: "Di dalam join ada blok \"answer\"", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("op_join") && reporterTypes(b).includes("answer"))) }],
    "p5-t4": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "\"when I receive\" berisi repeat dengan blok Motion", test: () => receivedFromFlag(r => loopHas(r, ins => anyOf(ins, MOTION))) },
      { text: "Ada blok Sound", test: () => receivedFromFlag(r => hasAny(r, SOUND)) }],
    "p5-t5": [G_FLAG,
      { text: "Ada 2 pesan berbeda yang diterima 2 rangkaian \"when I receive\"", test: () => new Set(recvStacks().map(r => ddVal(r.blocks[0]))).size >= 2 },
      { text: "Ada ganti latar", test: () => recvStacks().some(r => hasAny(r, BACKDROP_BLOCKS)) },
      { text: "Ada blok bicara (say / think)", test: () => recvStacks().some(r => countText(r) >= 1) },
      { text: "Ada blok Sound", test: () => recvStacks().some(r => hasAny(r, SOUND)) },
      { text: "Ada repeat", test: () => recvStacks().some(r => loopsOf(r).length > 0) }],

    // ---------- Tahap 2 • Game Development ----------
    "g1-t1": [G_FLAG,
      { text: "Ada blok \"repeat\" di bawah bendera", test: () => someFlag(i => loopsOf(i).length > 0) },
      { text: "Di dalam repeat ada \"next costume\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["next_costume"]))) },
      { text: "Di dalam repeat ada \"move\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["move_steps"]))) },
      { text: "Di dalam repeat ada \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) }],
    "g1-t2": [G_FLAG,
      { text: "Ada 4 tombol berbeda yang menggerakkan karakter", test: () => distinctKeys(keyStacks().filter(i => hasAny(i, MOTION))) >= 4 },
      { text: "Ada tombol lompat (naik, wait, lalu turun)", test: () => keyStacks().some(i => { const t = i.blocks; const up = t.findIndex(b => b.type === "change_y" && num(b) > 0); if (up < 0) return false; const w = t.findIndex((b, k) => k > up && b.type === "wait_secs"); if (w < 0) return false; return t.some((b, k) => k > w && b.type === "change_y" && num(b) < 0); }) }],
    "g1-t3": [G_FLAG,
      { text: "Skor diisi 0 saat bendera diklik (set variable)", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Skor ditampilkan (show variable)", test: () => someFlag(i => i.types.includes("show_var")) },
      { text: "Saat sprite diklik, skor bertambah (change variable)", test: () => clickStacks().some(i => i.types.includes("change_var")) },
      { text: "Sprite pindah ke posisi acak (go to random position)", test: () => clickStacks().some(i => i.types.includes("goto_random")) }],
    "g1-t4": [G_FLAG,
      { text: "Waktu diisi di awal (set variable)", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Di dalam repeat ada \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) },
      { text: "Di dalam repeat waktu berkurang (change variable angka negatif)", test: () => someFlag(i => loopHas(i, ins => ins.some(b => b.type === "change_var" && num(b) < 0))) },
      { text: "Setelah repeat ada say atau stop", test: () => someFlag(i => loopsOf(i).some(l => { const idx = i.blocks.indexOf(l); return anyOf(i.blocks.slice(idx + 1 + inside(l).length), SAY.concat(["stop"])); })) }],
    "g1-t5": [G_FLAG,
      { text: "Ada variabel skor dan waktu (2 blok set variable)", test: () => someFlag(i => i.blocks.filter(b => b.type === "set_var").length >= 2) },
      { text: "Waktu berkurang di dalam repeat dengan wait", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]) && ins.some(b => b.type === "change_var" && num(b) < 0))) },
      { text: "Klik sprite menambah skor dan pindah posisi acak", test: () => clickStacks().some(i => i.types.includes("change_var") && i.types.includes("goto_random")) },
      { text: "Ada if / if-else yang membandingkan skor, lalu say", test: () => someFlag(i => i.blocks.some(b => IFS.includes(b.type) && reporterTypes(b).some(t => CMP.includes(t)) && anyOf(inside(b), SAY))) }],
    "g1-t6": [G_FLAG,
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada blok ganti kostum", test: () => someFlag(i => hasAny(i, ["switch_costume", "next_costume"])) },
      { text: "Ada blok ukuran (set size / change size)", test: () => someFlag(i => hasAny(i, SIZE_FX)) },
      { text: "Ada blok \"wait\"", test: () => someFlag(i => i.types.includes("wait_secs")) }]
  };

  // ---------- PARAMETER URL ----------
  // ?task=p1-t1        → task dari Jalur Belajar (baru)
  // ?grade=sd&level=1  → level lama (tetap berfungsi)
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  const hasLP = typeof LP !== "undefined";
  const grade = params.get("grade");
  const level = parseInt(params.get("level"), 10);
  let mission = MISSIONS[grade] && MISSIONS[grade][level];
  let levelKey, tag, nameLine, doneTitle, nextLabel, nextHref, backHref, backLabel, hasNext, pointsBase, pointsBonus;

  if (taskId && hasLP) {
    const info = LP.find(taskId);
    if (!info || !EDITOR_GOALS[taskId]) return;
    if (!LP.isUnlocked(taskId)) {               // task belum terbuka → balik ke jalur belajar
      window.location.replace("/SD/belajar.html?task=" + taskId);   // halaman belajar menampilkan info "Masih terkunci"
      return;
    }
    const nxt = LP.next(taskId);
    mission = { title: info.task.title, challenge: info.task.desc, hint: info.task.hint, goals: EDITOR_GOALS[taskId] };
    levelKey = taskId;
    if (LP.mulaiTask) LP.mulaiTask(taskId);   // mulai hitung waktu pengerjaan
    tag = "🎯 TASK " + info.task.no + " • " + info.task.label;
    nameLine = "Task " + info.task.no + " — " + info.task.title;
    doneTitle = "Hore, berhasil!";
    hasNext = !!nxt;
    nextLabel = nxt && nxt.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →";
    nextHref = nxt ? LP.href(nxt.id, true) : null;
    backHref = "/SD/belajar.html?p=" + info.pemb.id;
    backLabel = "Kembali ke jalur belajar";
    pointsBase = LP.poinOf(info.task);
    pointsBonus = 0;                            // bonus task Jalur Belajar ditentukan server (lihat LP.complete)
  } else {
    if (!mission) return;                       // tanpa parameter = mode bebas
    levelKey = grade + "-" + level;
    tag = "🎯 MISI • " + GRADE_NAME[grade] + " Level " + level;
    nameLine = GRADE_NAME[grade] + " Level " + level + " — " + mission.title;
    doneTitle = "Level selesai!";
    hasNext = !!(MISSIONS[grade] && MISSIONS[grade][level + 1]);
    nextLabel = "Level berikutnya →";
    nextHref = "index.html?grade=" + grade + "&level=" + (level + 1);
    backHref = DASHBOARD_URL;
    backLabel = "Kembali ke dashboard";
    pointsBase = POINTS_BASE;
    pointsBonus = POINTS_BONUS;
  }

  // ---------- PENYIMPANAN (per username) ----------
  const user = localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu";
  const progressKey = "codingCompleted_" + user;
  const pointsKey   = "codingPoints_" + user;

  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  const getCompleted = () => loadJSON(progressKey, {});
  const getPoints    = () => Number(localStorage.getItem(pointsKey)) || 0;

  // ---------- UI KARTU MISI ----------
  const panel = document.querySelector(".workspace-panel");
  if (!panel) return;

  const card = document.createElement("div");
  card.className = "mission-card";
  card.innerHTML =
    '<div class="mission-head">' +
      '<span class="mission-tag"></span>' +
      '<button type="button" class="mission-toggle" title="Ciutkan / buka">−</button>' +
    '</div>' +
    '<div class="mission-body">' +
      '<div class="mission-title"></div>' +
      '<div class="mission-challenge"></div>' +
      '<ul class="mission-goals"></ul>' +
      '<div class="mission-hint"></div>' +
      '<div class="mission-foot"><span class="mission-points"></span><button type="button" class="mission-manual" hidden>Tandai selesai</button></div>' +
    '</div>';
  panel.appendChild(card);

  const q = (s) => card.querySelector(s);
  q(".mission-tag").textContent = tag;
  q(".mission-title").textContent = mission.title;
  q(".mission-challenge").textContent = mission.challenge;
  q(".mission-hint").textContent = mission.hint ? "💡 " + mission.hint : "";
  q(".mission-toggle").addEventListener("click", () => {
    card.classList.toggle("collapsed");
    q(".mission-toggle").textContent = card.classList.contains("collapsed") ? "+" : "−";
  });

  const goals = (mission.goals || []).concat([{ text: "Klik bendera hijau 🚩 untuk menjalankan", test: () => ranOk }]);
  const goalsEl = q(".mission-goals");
  const goalLis = goals.map(g => {
    const li = document.createElement("li");
    li.innerHTML = '<span class="mission-check">☐</span><span></span>';
    li.lastChild.textContent = g.text;
    goalsEl.appendChild(li);
    return li;
  });

  const isLPTask = !!(hasLP && taskId && LP.find(taskId));
  const shownPoints = () => (isLPTask && LP.saldo) ? LP.saldo() : getPoints();   // sama dengan dashboard & halaman poin
  function refreshPoints() { q(".mission-points").textContent = "⭐ " + shownPoints() + " poin"; }
  refreshPoints();
  if (isLPTask && LP.loadFromServer) LP.loadFromServer().then((ok) => { if (ok) refreshPoints(); }).catch(() => {});

  if (taskId) {                                 // link kembali ke jalur belajar
    const back = document.createElement("a");
    back.className = "mission-back";
    back.href = backHref;
    back.textContent = "← Jalur belajar";
    q(".mission-foot").appendChild(back);
  }
  if (getCompleted()[levelKey]) {               // sudah pernah selesai
    const note = document.createElement("div");
    note.className = "mission-done-note";
    note.textContent = "✅ Sudah selesai! Mengulang tidak memberi poin tambahan.";
    q(".mission-body").insertBefore(note, q(".mission-hint"));
  }

  // ---------- STATUS ----------
  let ranOk = false;
  let failedAttempts = 0;
  let finished = false;

  function buildGoalsMet() {
    return (mission.goals || []).every(g => { try { return g.test(); } catch (e) { return false; } });
  }

  function updateChecklist() {
    goals.forEach((g, i) => {
      let ok = false;
      try { ok = !!g.test(); } catch (e) {}
      goalLis[i].classList.toggle("done", ok);
      goalLis[i].firstChild.textContent = ok ? "✅" : "☐";
    });
  }
  setInterval(updateChecklist, 500);
  updateChecklist();

  // Level tanpa cek otomatis: tombol manual
  if (!mission.goals) {
    goalsEl.style.display = "none";
    const note = document.createElement("div");
    note.className = "mission-note";
    note.textContent = "Cek otomatis untuk level ini belum tersedia. Selesaikan tantangannya, lalu tekan \"Tandai selesai\".";
    q(".mission-body").insertBefore(note, q(".mission-hint"));
    const btn = q(".mission-manual");
    btn.hidden = false;
    btn.addEventListener("click", () => completeMission(false));
  }

  // ---------- JALANKAN: hitung percobaan & cek selesai ----------
  // Jumlah percobaan gagal disimpan per task (supaya tetap terhitung setelah halaman dibuka lagi)
  function getAttempts() { return hasLP ? LP.attempts(levelKey) : failedAttempts; }
  function addAttempt()  { return hasLP ? LP.addAttempt(levelKey) : ++failedAttempts; }

  const originalRun = runProgram;
  runProgram = async function () {
    if (finished) return originalRun.apply(this, arguments);

    const metBefore = mission.goals ? buildGoalsMet() : false;
    const alreadyDone = !!getCompleted()[levelKey];
    let attemptNo = 0;
    if (mission.goals && !metBefore && !alreadyDone) attemptNo = addAttempt();

    const result = await originalRun.apply(this, arguments);

    if (mission.goals && metBefore) {
      ranOk = true;
      updateChecklist();
      completeMission(getAttempts() === 0);
    } else if (attemptNo) {
      showFailPopup(attemptNo);
    }
    return result;
  };

  // Popup "Belum berhasil!" — desain sama dengan popup berhasil
  function showFailPopup(n) {
    const old = document.querySelector(".mission-overlay");
    if (old) old.remove();
    const unmet = (mission.goals || []).filter(g => { try { return !g.test(); } catch (e) { return true; } }).slice(0, 3);
    const ov = document.createElement("div");
    ov.className = "mission-overlay";
    ov.innerHTML =
      '<div class="mission-popup fail">' +
        '<div class="mp-emoji">❌</div>' +
        '<h2>Belum berhasil!</h2>' +
        '<p class="mp-info">Ini percobaan ke-' + n + '. Coba periksa lagi blok yang digunakan.</p>' +
        (unmet.length ? '<ul class="mp-unmet"><li>' + unmet.map(g => g.text).join('</li><li>') + '</li></ul>' : '') +
        '<div class="mp-actions"><button type="button" class="mp-primary" data-act="stay">Coba lagi</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => {
      if (e.target === ov || (e.target.dataset && e.target.dataset.act === "stay")) ov.remove();
    });
  }

  // ---------- SELESAI ----------
  async function completeMission(firstTry) {
    if (finished) return;
    finished = true;

    const done = getCompleted();
    const already = !!done[levelKey];
    let earned = 0, bonus = 0;

    if (!already) {
      if (isLPTask) {
        // task Jalur Belajar: lewat LP.complete supaya poin, riwayat, dan database ikut tersimpan (sama seperti editor lain)
        const r = LP.complete(levelKey, !!(firstTry && mission.goals));
        if (r && r.blocked) {                   // gerbang materi: materi belum dibaca sampai selesai
          finished = false;
          alert("📖 Baca materinya sampai selesai dulu ya, baru task ini bisa diselesaikan.");
          return;
        }
        const s = await r.ready;                // poin & bonus dari jawaban server
        earned = s.earned; bonus = s.bonus;
      } else {
        earned = pointsBase;
        bonus = (firstTry && mission.goals) ? pointsBonus : 0;
        done[levelKey] = true;
        localStorage.setItem(progressKey, JSON.stringify(done));
        localStorage.setItem(pointsKey, String(getPoints() + earned + bonus));
      }
    }
    refreshPoints();
    showDonePopup(already, earned, bonus);
  }

  function showDonePopup(already, earned, bonus) {
    const old = document.querySelector(".mission-overlay");     // jangan menumpuk dengan popup lain
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.className = "mission-overlay";

    let lines = "";
    if (already) {
      lines = '<p class="mp-info">Misi ini sudah selesai. Kamu boleh mencoba lagi, tetapi poin tidak bertambah.</p>';
    } else {
      lines = '<div class="mp-points"><b>+' + earned + '</b> poin</div>';
      if (bonus) lines += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + bonus + '</div>';
      lines += '<p class="mp-info">Poinmu sekarang: <b>⭐ ' + shownPoints() + '</b></p>';
    }

    ov.innerHTML =
      '<div class="mission-popup">' +
        '<div class="mp-emoji">' + (already ? "✅" : "🎉") + '</div>' +
        '<h2>' + (already ? "Sudah selesai!" : doneTitle) + '</h2>' +
        '<p class="mp-name">' + nameLine + '</p>' +
        lines +
        '<div class="mp-actions">' +
          (hasNext
            ? '<button type="button" class="mp-primary" data-act="next">' + nextLabel + '</button>'
            : '<div class="mp-all">🏆 Semua level tingkat ' + GRADE_NAME[grade] + ' selesai!</div>') +
          '<button type="button" class="mp-secondary" data-act="dash">' + backLabel + '</button>' +
          '<button type="button" class="mp-link" data-act="stay">Lanjut bereksperimen</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.addEventListener("click", (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === "next") window.location.href = nextHref;
      if (act === "dash") window.location.href = backHref;
      if (act === "stay") ov.remove();
    });
  }
})();
