// Same-origin by default (FastAPI serves this page). If you host the frontend
// elsewhere, put your API URL here, e.g. "https://your-api.onrender.com"
const API_URL = "http://127.0.0.1:8000";

const $ = (s) => document.querySelector(s);
const form = $("#form"), result = $("#result"), fill = $("#fill");
const GRADES = ["A", "B", "C", "D", "E", "F", "G"];

// ---- grade chips
const gradeBox = $("#grades"), gradeInput = form.loan_grade;
GRADES.forEach((g) => {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = g;
  b.onclick = () => setGrade(g);
  gradeBox.appendChild(b);
});
function setGrade(g) {
  gradeInput.value = g;
  [...gradeBox.children].forEach((b) => b.classList.toggle("on", b.textContent === g));
}
setGrade("B");

// ---- income share (computed field)
function percentIncome() {
  const inc = parseFloat(form.person_income.value), amt = parseFloat(form.loan_amnt.value);
  return inc > 0 && amt >= 0 ? amt / inc : 0;
}
function updatePct() { $("#pctOut").textContent = Math.round(percentIncome() * 100) + "%"; }
["person_income", "loan_amnt"].forEach((n) => form[n].addEventListener("input", updatePct));
updatePct();

// ---- examples
const EXAMPLES = {
  safe:  { person_age: 38, person_income: 95000, person_home_ownership: "MORTGAGE", person_emp_length: 9, loan_intent: "HOMEIMPROVEMENT", loan_amnt: 8000, loan_int_rate: 7.5, cb_person_cred_hist_length: 12, cb_person_default_on_file: "N", grade: "A" },
  risky: { person_age: 23, person_income: 28000, person_home_ownership: "RENT", person_emp_length: 1, loan_intent: "MEDICAL", loan_amnt: 18000, loan_int_rate: 17.8, cb_person_cred_hist_length: 2, cb_person_default_on_file: "Y", grade: "E" },
};
document.querySelectorAll("[data-example]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const ex = EXAMPLES[btn.dataset.example];
    Object.entries(ex).forEach(([k, v]) => {
      if (k === "grade") return setGrade(v);
      if (k === "cb_person_default_on_file") return (form.querySelector(`[name=${k}][value=${v}]`).checked = true);
      form[k].value = v;
    });
    updatePct();
  })
);

// ---- gauge helpers
function pointOnArc(t, r) {
  const a = Math.PI * (1 - t);
  return [120 + r * Math.cos(a), 120 - r * Math.sin(a)];
}
function placeTick(t) {
  const [x1, y1] = pointOnArc(t, 88), [x2, y2] = pointOnArc(t, 112), [lx, ly] = pointOnArc(t, 124);
  const tick = $("#tick");
  tick.setAttribute("x1", x1); tick.setAttribute("y1", y1);
  tick.setAttribute("x2", x2); tick.setAttribute("y2", y2);
  const label = $("#tickLabel");
  label.setAttribute("x", lx); label.setAttribute("y", ly);
}
function countUp(el, to, ms = 1400) {
  const start = performance.now();
  (function frame(now) {
    const p = Math.min((now - start) / ms, 1), eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (to * eased).toFixed(1);
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}

// ---- submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#error"); err.hidden = true;

  const required = form.querySelectorAll("input[type=number]");
  let ok = true;
  required.forEach((i) => {
    const bad = i.value === "" || Number(i.value) < Number(i.min || -Infinity);
    i.classList.toggle("invalid", bad); if (bad) ok = false;
  });
  if (!ok) { err.textContent = "Some fields are empty or out of range. Check the highlighted ones."; err.hidden = false; return; }

  const payload = {
    person_age: parseInt(form.person_age.value),
    person_income: parseFloat(form.person_income.value),
    person_home_ownership: form.person_home_ownership.value,
    person_emp_length: parseFloat(form.person_emp_length.value),
    loan_intent: form.loan_intent.value,
    loan_grade: gradeInput.value,
    loan_amnt: parseFloat(form.loan_amnt.value),
    loan_int_rate: parseFloat(form.loan_int_rate.value),
    loan_percent_income: Number(percentIncome().toFixed(2)),
    cb_person_default_on_file: form.cb_person_default_on_file.value,
    cb_person_cred_hist_length: parseInt(form.cb_person_cred_hist_length.value),
  };

  const btn = $("#submit");
  btn.disabled = true; btn.classList.add("loading");
  result.dataset.state = "loading";
  fill.style.strokeDasharray = "";
  $("#verdictTitle").textContent = "Scoring…";
  $("#verdictText").textContent = "The model is reviewing this application.";

  try {
    const res = await fetch(API_URL + "/predict", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Server returned ${res.status}`);
    show(await res.json());
  } catch (ex) {
    result.dataset.state = "idle";
    $("#verdictTitle").textContent = "Couldn't get a result";
    $("#verdictText").textContent = "Check the details and try again.";
    err.textContent = "Request failed: " + ex.message + ". If the server was asleep, wait a few seconds and retry.";
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.classList.remove("loading");
  }
});

function show(d) {
  const p = d.default_probability, t = d.threshold, high = d.default_prediction === 1;
  placeTick(Math.min(Math.max(t, 0), 1));
  result.dataset.state = high ? "high" : "low";
  requestAnimationFrame(() => (fill.style.strokeDasharray = `${Math.max(p * 100, 1.5)} 100`));
  countUp($("#pct"), p * 100);

  $("#verdictTitle").textContent = high ? "High risk" : "Low risk";
  $("#verdictText").textContent = high
    ? "The estimated default chance is above the cut-off. Review this application carefully."
    : "The estimated default chance is below the cut-off. This application looks safe to approve.";
  const v = $("#verdict"); v.classList.remove("pop"); void v.offsetWidth; v.classList.add("pop");

  $("#fScore").textContent = (p * 100).toFixed(1) + "%";
  $("#fThresh").textContent = (t * 100).toFixed(1) + "%";
  const m = (p - t) * 100;
  $("#fMargin").textContent = (m > 0 ? "+" : "") + m.toFixed(1) + " pts";
  $("#facts").hidden = false;
}
