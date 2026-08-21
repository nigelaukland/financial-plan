import React, { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { storage } from "./storage";

// ---------- helpers ----------
const gbp = (n, dp = 0) =>
  "£" + Math.round(n).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp });
const gbpK = (n) => "£" + (n / 1000).toFixed(0) + "k";

// custom tooltip: shows each series plus a computed total, since Recharts' own payload
// aggregation can't be relied on to include an extra series added just for a total
function PotTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum, p) => sum + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, background: "#fff", border: "1px solid #cfc7ac", borderRadius: 3, padding: "8px 10px", color: "#12181F" }}>
      <div style={{ marginBottom: 4, color: "#5b5548" }}>Age {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {gbp(p.value)}</div>
      ))}
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #cfc7ac", fontWeight: 600, color: "#12181F" }}>
        Total pension pot: {gbp(total)}
      </div>
    </div>
  );
}

function fvSeries({ present, monthly, annualRatePct, years, contributeYears, lumpSum = 0, lumpSumYear = 0, stepMonthly, stepYear }) {
  const contribMonths = (contributeYears == null ? years : contributeYears) * 12;
  const lumpSumMonth = Math.round(lumpSumYear * 12);
  const stepMonth = stepYear != null ? Math.round(stepYear * 12) : null;
  const r = annualRatePct / 100 / 12;
  const rows = [];
  let bal = present;
  for (let m = 0; m <= years * 12; m++) {
    if (m > 0) {
      const currentMonthly = stepMonth != null && m >= stepMonth ? stepMonthly : monthly;
      bal = bal * (1 + r) + (m <= contribMonths ? currentMonthly : 0);
    }
    if (lumpSum && m === lumpSumMonth) bal += lumpSum;
    if (m % 12 === 0) rows.push(bal);
  }
  return rows; // yearly snapshots, length years+1
}

function Field({ label, unit, value, onChange, step = 1, min = 0, max, hint, readOnly = false, type = "number" }) {
  const isText = type === "text";
  return (
    <label className="fp-field">
      <span className="fp-label">{label}</span>
      <div className="fp-input-row" style={readOnly ? { opacity: 0.75 } : undefined}>
        {unit === "£" && <span className="fp-unit">£</span>}
        <input
          type={type}
          className="fp-input"
          value={value}
          step={isText ? undefined : step}
          min={isText ? undefined : min}
          max={isText ? undefined : max}
          readOnly={readOnly}
          onChange={readOnly ? undefined : (e) => onChange(isText ? e.target.value : (e.target.value === "" ? 0 : parseFloat(e.target.value)))}
        />
        {unit && unit !== "£" && <span className="fp-unit-suffix">{unit}</span>}
      </div>
      {hint && <span className="fp-hint">{hint}</span>}
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, display, hint }) {
  return (
    <label className="fp-field">
      <div className="fp-slider-top">
        <span className="fp-label">{label}</span>
        <span className="fp-slider-value">{display ? display(value) : value}</span>
      </div>
      <input
        type="range"
        className="fp-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <span className="fp-hint">{hint}</span>}
    </label>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <div className="fp-panel">
      <div className="fp-panel-head">
        <span className="fp-eyebrow">{eyebrow}</span>
        <h3 className="fp-panel-title">{title}</h3>
      </div>
      <div className="fp-panel-body">{children}</div>
    </div>
  );
}

function PersonPanel({ person, onChange, retireAgeValue, onRetireAgeChange, retireAgeHint, stepMaxAge, monthlyPayment }) {
  return (
    <>
      <Field label="Name" type="text" value={person.name ?? ""} onChange={(v) => onChange({ ...person, name: v })} />
      <div className="fp-two-col">
        <Field label="Age" value={person.age} onChange={(v) => onChange({ ...person, age: v })} />
        <Field label="Gross income" unit="£" value={person.income} step={500} onChange={(v) => onChange({ ...person, income: v })} />
      </div>
      <Slider
        label="Target retirement age"
        value={retireAgeValue}
        min={person.age + 1}
        max={75}
        onChange={onRetireAgeChange}
        display={(v) => `Age ${v}`}
        hint={retireAgeHint}
      />
      <div className="fp-two-col">
        <Field label="Own contribution" unit="%" value={person.contribPct} step={0.5} onChange={(v) => onChange({ ...person, contribPct: v })} />
        <Field label="Employer contribution" unit="%" value={person.employerPct} step={0.5} onChange={(v) => onChange({ ...person, employerPct: v })} />
      </div>
      <Field label="Current pension pot" unit="£" value={person.pot} step={1000} onChange={(v) => onChange({ ...person, pot: v })} />
      <Field label="Monthly pension payment" unit="£" value={Math.round(monthlyPayment)} onChange={() => {}} readOnly hint="Own + employer contribution combined." />
      <label className="fp-field fp-checkbox-field">
        <span className="fp-checkbox-row">
          <input
            type="checkbox"
            className="fp-checkbox"
            checked={person.stepEnabled ?? false}
            onChange={(e) => onChange({ ...person, stepEnabled: e.target.checked })}
          />
          <span className="fp-label">Step change in pension payment</span>
        </span>
      </label>
      {person.stepEnabled && (
        <>
          <Field label="New monthly payment" unit="£" value={person.stepAmount ?? 0} step={50} onChange={(v) => onChange({ ...person, stepAmount: v })} />
          <Slider
            label="Starts at age"
            value={Math.min(Math.max(person.stepAge ?? person.age, person.age), stepMaxAge)}
            min={person.age}
            max={stepMaxAge}
            onChange={(v) => onChange({ ...person, stepAge: v })}
            display={(v) => `Age ${v}`}
          />
        </>
      )}
      <div className="fp-subhead">ISA</div>
      <div className="fp-two-col">
        <Field label="Current ISA balance" unit="£" value={person.isaBalance ?? 0} step={1000} onChange={(v) => onChange({ ...person, isaBalance: v })} />
        <Field label="Monthly contribution" unit="£" value={person.isaMonthly ?? 0} step={50} onChange={(v) => onChange({ ...person, isaMonthly: v })} />
      </div>
      <div className="fp-subhead">SIPP</div>
      <div className="fp-two-col">
        <Field label="Current SIPP balance" unit="£" value={person.sippBalance ?? 0} step={1000} onChange={(v) => onChange({ ...person, sippBalance: v })} />
        <Field label="Monthly contribution" unit="£" value={person.sippMonthly ?? 0} step={50} onChange={(v) => onChange({ ...person, sippMonthly: v })} />
      </div>
      <div className="fp-subhead">State pension</div>
      <div className="fp-two-col">
        <Field label="State pension age" value={person.statePensionAge ?? 67} onChange={(v) => onChange({ ...person, statePensionAge: v })} />
        <Field label="Annual amount" unit="£" value={person.statePensionAmount ?? 0} step={100} onChange={(v) => onChange({ ...person, statePensionAmount: v })} />
      </div>
      <div className="fp-subhead">Inheritance</div>
      <Field label="Amount" unit="£" value={person.inheritanceAmount ?? 0} step={1000} onChange={(v) => onChange({ ...person, inheritanceAmount: v })} hint="A once-off lump sum, added directly to their pension pot." />
      <Slider
        label="Received at age"
        value={Math.min(Math.max(person.inheritanceAge ?? person.age, person.age), stepMaxAge)}
        min={person.age}
        max={stepMaxAge}
        onChange={(v) => onChange({ ...person, inheritanceAge: v })}
        display={(v) => `Age ${v}`}
        hint="Grows at the pension growth rate from this point onward."
      />
    </>
  );
}

function CategoryCard({ cat, onAddItem, onUpdateItem, onRemoveItem, onRename, onRemoveCategory, actuals, onSetActual, showActuals }) {
  return (
    <div className="fp-panel fp-cat-card">
      <div className="fp-panel-head fp-cat-head">
        <div>
          <span className="fp-eyebrow">{cat.type === "income" ? "Income" : "Expense"}</span>
          <input
            className="fp-cat-name-input"
            value={cat.name}
            onChange={(e) => onRename(cat.id, e.target.value)}
          />
        </div>
        {cat.id !== "income" && (
          <button className="fp-remove-btn" onClick={() => onRemoveCategory(cat.id)} aria-label={`Remove ${cat.name}`}>×</button>
        )}
      </div>
      <div className="fp-panel-body">
        {showActuals && (
          <div className="fp-item-col-heads">
            <span />
            <span>Planned</span>
            <span>Actual</span>
            <span />
          </div>
        )}
        {cat.items.map((it) => {
          const actualVal = actuals[it.id];
          const hasActual = actualVal !== undefined && actualVal !== "";
          const variance = hasActual ? Number(actualVal) - Number(it.planned) : null;
          const varianceGood = cat.type === "income" ? variance >= 0 : variance <= 0;
          return (
            <div className={`fp-item-row ${showActuals ? "with-actuals" : ""}`} key={it.id}>
              <input
                className="fp-lineitem-label-input"
                value={it.label}
                onChange={(e) => onUpdateItem(cat.id, it.id, "label", e.target.value)}
              />
              <div className="fp-lineitem-amount">
                <span className="fp-unit">£</span>
                <input
                  type="number"
                  className="fp-input"
                  value={it.planned}
                  step={5}
                  onChange={(e) => onUpdateItem(cat.id, it.id, "planned", e.target.value === "" ? 0 : parseFloat(e.target.value))}
                />
              </div>
              {showActuals && (
                <div className="fp-lineitem-amount actual">
                  <span className="fp-unit">£</span>
                  <input
                    type="number"
                    className="fp-input"
                    placeholder="—"
                    value={actualVal === undefined ? "" : actualVal}
                    step={5}
                    onChange={(e) => onSetActual(it.id, e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                </div>
              )}
              <button className="fp-remove-btn" onClick={() => onRemoveItem(cat.id, it.id)} aria-label={`Remove ${it.label}`}>×</button>
            </div>
          );
        })}
        <div className="fp-lineitem-footer">
          <button className="fp-add-btn" onClick={() => onAddItem(cat.id)}>+ Add item</button>
          <span className="fp-lineitem-total">
            Planned {gbp(cat.items.reduce((s, i) => s + (Number(i.planned) || 0), 0))}/mo
          </span>
        </div>
      </div>
    </div>
  );
}

export default function FinancialPlan() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const [tab, setTab] = useState("retirement");

  // household
  const [a1, setA1] = useState({ name: "Adult 1", age: 46, income: 55000, contribPct: 5, employerPct: 3, pot: 80000, isaBalance: 17500, isaMonthly: 250, sippBalance: 0, sippMonthly: 0, stepEnabled: false, stepAmount: 0, stepAge: 55, statePensionAge: 67, statePensionAmount: 11500, inheritanceAmount: 0, inheritanceAge: 55 });
  const [a2, setA2] = useState({ name: "Adult 2", age: 48, income: 45000, contribPct: 5, employerPct: 3, pot: 60000, isaBalance: 17500, isaMonthly: 250, sippBalance: 0, sippMonthly: 0, stepEnabled: false, stepAmount: 0, stepAge: 55, statePensionAge: 67, statePensionAmount: 11500, inheritanceAmount: 0, inheritanceAge: 55 });

  const [personTab, setPersonTab] = useState("a1");

  // outgoings / mortgage
  const [monthlyOutgoings, setMonthlyOutgoings] = useState(2800);
  const [houseValue, setHouseValue] = useState(550000);
  const [mortgageBalance, setMortgageBalance] = useState(240000);
  const [mortgagePayment, setMortgagePayment] = useState(1350);
  const [mortgageYearsLeft, setMortgageYearsLeft] = useState(17);

  // downsizing — release some house equity at retirement, no new mortgage
  const [planToDownsize, setPlanToDownsize] = useState(false);
  const [downsizePropertyValue, setDownsizePropertyValue] = useState(300000);

  // pay off any remaining mortgage balance out of savings at the retirement point
  const [payOffMortgageAtRetirement, setPayOffMortgageAtRetirement] = useState(false);

  // savings / ISA — balance & contribution are per-adult, growth rate is a shared assumption
  const [isaGrowth, setIsaGrowth] = useState(5);

  // SIPP / personal pension — balance & contribution are per-adult, growth rate is a shared assumption
  const [sippGrowth, setSippGrowth] = useState(5);

  // assumptions
  const [pensionGrowth, setPensionGrowth] = useState(5);
  const [inflation, setInflation] = useState(2.5);
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [yAxisMaxEnabled, setYAxisMaxEnabled] = useState(false);
  const [yAxisMax, setYAxisMax] = useState(1000000);
  const [targetRetireAge, setTargetRetireAge] = useState(62);
  const [a2TargetRetireAge, setA2TargetRetireAge] = useState(62);
  const [desiredIncome, setDesiredIncome] = useState(38000);

  // --- retirement scenarios: named snapshots of every input above ---
  const [retirementLoaded, setRetirementLoaded] = useState(false);
  const [scenarios, setScenarios] = useState({}); // { name: retirementStateObject }
  const [scenarioName, setScenarioName] = useState("");

  const getRetirementState = () => ({
    a1, a2, monthlyOutgoings, houseValue, mortgageBalance, mortgagePayment, mortgageYearsLeft,
    planToDownsize, downsizePropertyValue, payOffMortgageAtRetirement,
    isaGrowth, sippGrowth, pensionGrowth, inflation, adjustForInflation,
    withdrawalRate, yAxisMaxEnabled, yAxisMax, targetRetireAge, a2TargetRetireAge, desiredIncome,
  });
  const applyRetirementState = (s) => {
    if (!s) return;
    if (s.a1) setA1(s.a1);
    if (s.a2) setA2(s.a2);
    if (s.monthlyOutgoings !== undefined) setMonthlyOutgoings(s.monthlyOutgoings);
    if (s.houseValue !== undefined) setHouseValue(s.houseValue);
    if (s.mortgageBalance !== undefined) setMortgageBalance(s.mortgageBalance);
    if (s.mortgagePayment !== undefined) setMortgagePayment(s.mortgagePayment);
    if (s.mortgageYearsLeft !== undefined) setMortgageYearsLeft(s.mortgageYearsLeft);
    if (s.planToDownsize !== undefined) setPlanToDownsize(s.planToDownsize);
    if (s.downsizePropertyValue !== undefined) setDownsizePropertyValue(s.downsizePropertyValue);
    if (s.payOffMortgageAtRetirement !== undefined) setPayOffMortgageAtRetirement(s.payOffMortgageAtRetirement);
    if (s.isaGrowth !== undefined) setIsaGrowth(s.isaGrowth);
    if (s.sippGrowth !== undefined) setSippGrowth(s.sippGrowth);
    if (s.pensionGrowth !== undefined) setPensionGrowth(s.pensionGrowth);
    if (s.inflation !== undefined) setInflation(s.inflation);
    if (s.adjustForInflation !== undefined) setAdjustForInflation(s.adjustForInflation);
    if (s.withdrawalRate !== undefined) setWithdrawalRate(s.withdrawalRate);
    if (s.yAxisMaxEnabled !== undefined) setYAxisMaxEnabled(s.yAxisMaxEnabled);
    if (s.yAxisMax !== undefined) setYAxisMax(s.yAxisMax);
    if (s.targetRetireAge !== undefined) setTargetRetireAge(s.targetRetireAge);
    if (s.a2TargetRetireAge !== undefined) setA2TargetRetireAge(s.a2TargetRetireAge);
    if (s.desiredIncome !== undefined) setDesiredIncome(s.desiredIncome);
  };
  const saveScenario = () => {
    const name = scenarioName.trim();
    if (!name) return;
    setScenarios((prev) => ({ ...prev, [name]: getRetirementState() }));
    setScenarioName("");
  };
  const loadScenario = (name) => {
    applyRetirementState(scenarios[name]);
    setScenarioName(name);
  };
  const deleteScenario = (name) => {
    setScenarios((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // --- household budget: dynamic categories, tracked per period, persisted ---
  const defaultCategories = () => [
    { id: "income", name: "Income", type: "income", items: [
      { id: "a1net", label: "Adult 1 net income", planned: 3450 },
      { id: "a2net", label: "Adult 2 net income", planned: 2900 },
      { id: "otherinc", label: "Other income", planned: 100 },
    ]},
    { id: "housing", name: "Housing & bills", type: "expense", items: [
      { id: "mortgage", label: "Mortgage / rent", planned: 1350 },
      { id: "counciltax", label: "Council tax", planned: 200 },
      { id: "utilities", label: "Gas, electric & water", planned: 260 },
      { id: "homeinsurance", label: "Home & contents insurance", planned: 45 },
      { id: "broadband", label: "Broadband & mobiles", planned: 90 },
    ]},
    { id: "living", name: "Living costs", type: "expense", items: [
      { id: "groceries", label: "Groceries", planned: 650 },
      { id: "transport", label: "Transport & fuel", planned: 280 },
      { id: "childcare", label: "Childcare & school costs", planned: 400 },
      { id: "health", label: "Health & medical", planned: 60 },
      { id: "clothing", label: "Clothing", planned: 90 },
    ]},
    { id: "lifestyle", name: "Lifestyle", type: "expense", items: [
      { id: "subs", label: "Subscriptions & streaming", planned: 45 },
      { id: "eatingout", label: "Eating out & socialising", planned: 220 },
      { id: "holidays", label: "Holidays (monthly equivalent)", planned: 250 },
      { id: "hobbies", label: "Hobbies & other leisure", planned: 100 },
    ]},
    { id: "saving", name: "Saving & investing", type: "expense", items: [
      { id: "isa", label: "ISA / savings", planned: 500 },
    ]},
  ];

  const [categories, setCategories] = useState(defaultCategories());
  const [actuals, setActuals] = useState({}); // { periodKey: { itemId: number } }
  const [periodType, setPeriodType] = useState("monthly"); // "monthly" | "quarterly"
  const [periodDate, setPeriodDate] = useState(new Date());
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | unavailable

  // load persisted budget + retirement data on mount
  useEffect(() => {
    (async () => {
      try {
        const [catRes, actRes, perRes, retRes, scenRes] = await Promise.all([
          storage.get("budget-categories-v1").catch(() => null),
          storage.get("budget-actuals-v1").catch(() => null),
          storage.get("budget-period-v1").catch(() => null),
          storage.get("retirement-current-v1").catch(() => null),
          storage.get("retirement-scenarios-v1").catch(() => null),
        ]);
        if (catRes && catRes.value) setCategories(JSON.parse(catRes.value));
        if (actRes && actRes.value) setActuals(JSON.parse(actRes.value));
        if (perRes && perRes.value) {
          const p = JSON.parse(perRes.value);
          if (p.periodType) setPeriodType(p.periodType);
          if (p.periodDate) setPeriodDate(new Date(p.periodDate));
        }
        if (retRes && retRes.value) applyRetirementState(JSON.parse(retRes.value));
        if (scenRes && scenRes.value) setScenarios(JSON.parse(scenRes.value));
      } catch (e) {
        setSaveStatus("unavailable");
      } finally {
        setBudgetLoaded(true);
        setRetirementLoaded(true);
      }
    })();
  }, []);

  // persist retirement inputs on change (skip the initial load tick)
  useEffect(() => {
    if (!retirementLoaded) return;
    (async () => {
      try {
        setSaveStatus("saving");
        await storage.set("retirement-current-v1", JSON.stringify(getRetirementState()));
        setSaveStatus("saved");
      } catch (e) { setSaveStatus("unavailable"); }
    })();
  }, [a1, a2, monthlyOutgoings, houseValue, mortgageBalance, mortgagePayment, mortgageYearsLeft,
      planToDownsize, downsizePropertyValue, payOffMortgageAtRetirement,
      isaGrowth, sippGrowth, pensionGrowth, inflation, adjustForInflation,
      withdrawalRate, yAxisMaxEnabled, yAxisMax, targetRetireAge, a2TargetRetireAge, desiredIncome, retirementLoaded]);

  // persist scenarios on change
  useEffect(() => {
    if (!retirementLoaded) return;
    storage.set("retirement-scenarios-v1", JSON.stringify(scenarios)).catch(() => {});
  }, [scenarios, retirementLoaded]);

  // persist on change (skip the initial load tick)
  useEffect(() => {
    if (!budgetLoaded) return;
    (async () => {
      try {
        setSaveStatus("saving");
        await storage.set("budget-categories-v1", JSON.stringify(categories));
        setSaveStatus("saved");
      } catch (e) { setSaveStatus("unavailable"); }
    })();
  }, [categories, budgetLoaded]);

  useEffect(() => {
    if (!budgetLoaded) return;
    (async () => {
      try {
        setSaveStatus("saving");
        await storage.set("budget-actuals-v1", JSON.stringify(actuals));
        setSaveStatus("saved");
      } catch (e) { setSaveStatus("unavailable"); }
    })();
  }, [actuals, budgetLoaded]);

  useEffect(() => {
    if (!budgetLoaded) return;
    storage.set("budget-period-v1", JSON.stringify({ periodType, periodDate: periodDate.toISOString() })).catch(() => {});
  }, [periodType, periodDate, budgetLoaded]);

  const periodKey = (date, type) => {
    if (type === "monthly") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${q}`;
  };
  const periodLabel = (date, type) => {
    if (type === "monthly") return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `Q${q} ${date.getFullYear()}`;
  };
  const shiftPeriod = (dir) => {
    const d = new Date(periodDate);
    d.setMonth(d.getMonth() + (periodType === "monthly" ? dir : dir * 3));
    setPeriodDate(d);
  };
  const currentKey = periodKey(periodDate, periodType);
  const currentActuals = actuals[currentKey] || {};
  const setActual = (itemId, value) => {
    setActuals((prev) => ({ ...prev, [currentKey]: { ...(prev[currentKey] || {}), [itemId]: value } }));
  };

  const addCategory = () => {
    const id = `cat-${Date.now()}`;
    setCategories((prev) => [...prev, { id, name: "New category", type: "expense", items: [] }]);
  };
  const renameCategory = (id, name) => setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  const removeCategory = (id) => setCategories((prev) => prev.filter((c) => c.id !== id));
  const addItem = (catId) => {
    const itemId = `item-${Date.now()}`;
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: [...c.items, { id: itemId, label: "New item", planned: 0 }] } : c)));
  };
  const updateItem = (catId, itemId, field, value) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)) } : c)));
  };
  const removeItem = (catId, itemId) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c)));
  };

  const years = Math.max(targetRetireAge - a1.age, 0);

  const calc = useMemo(() => {
    const a1Monthly = (a1.income * (a1.contribPct + a1.employerPct)) / 100 / 12;
    const a2Monthly = (a2.income * (a2.contribPct + a2.employerPct)) / 100 / 12;
    const a2ContributeYears = Math.max(0, Math.min(a2TargetRetireAge - a2.age, years));

    // when adjusting for inflation, compound at the real (inflation-stripped) rate so every
    // downstream figure lands in today's money, consistent with "desired income" already being that
    const realRate = (nominal) => (adjustForInflation ? nominal - inflation : nominal);
    const realPensionGrowth = realRate(pensionGrowth);
    const realIsaGrowth = realRate(isaGrowth);
    const realSippGrowth = realRate(sippGrowth);

    const houseEquityNow = houseValue - mortgageBalance;
    const mortgageNaturallyClear = mortgageYearsLeft <= years;
    // downsizing (no new mortgage) releases the gap between today's equity and the smaller
    // property's cost; treated as landing in the household savings pot at the retirement point
    const downsizeProceeds = planToDownsize ? Math.max(0, houseEquityNow - downsizePropertyValue) : 0;
    // paying off a still-running mortgage at retirement draws the remaining (today's) balance out of savings
    const mortgagePayoffAmount = payOffMortgageAtRetirement && !mortgageNaturallyClear ? mortgageBalance : 0;
    // each adult's inheritance lands in their own pension pot at whichever age falls within the projection horizon
    const a1InheritanceLumpSumYear = Math.max(0, Math.min((a1.inheritanceAge ?? a1.age) - a1.age, years));
    const a2InheritanceLumpSumYear = Math.max(0, Math.min((a2.inheritanceAge ?? a2.age) - a2.age, years));

    // a step change swaps the monthly pension payment for a new figure from a chosen age onward
    const a1StepYear = a1.stepEnabled ? Math.max(0, Math.min(a1.stepAge - a1.age, years)) : undefined;
    const a2StepYear = a2.stepEnabled ? Math.max(0, Math.min(a2.stepAge - a2.age, years)) : undefined;

    const a1Series = fvSeries({
      present: a1.pot, monthly: a1Monthly, annualRatePct: realPensionGrowth, years,
      lumpSum: a1.inheritanceAmount ?? 0, lumpSumYear: a1InheritanceLumpSumYear,
      stepMonthly: a1.stepEnabled ? a1.stepAmount : undefined, stepYear: a1StepYear,
    });
    const a2Series = fvSeries({
      present: a2.pot, monthly: a2Monthly, annualRatePct: realPensionGrowth, years, contributeYears: a2ContributeYears,
      lumpSum: a2.inheritanceAmount ?? 0, lumpSumYear: a2InheritanceLumpSumYear,
      stepMonthly: a2.stepEnabled ? a2.stepAmount : undefined, stepYear: a2StepYear,
    });
    const a1IsaSeries = fvSeries({ present: a1.isaBalance || 0, monthly: a1.isaMonthly || 0, annualRatePct: realIsaGrowth, years, lumpSum: downsizeProceeds - mortgagePayoffAmount, lumpSumYear: years });
    const a2IsaSeries = fvSeries({ present: a2.isaBalance || 0, monthly: a2.isaMonthly || 0, annualRatePct: realIsaGrowth, years, contributeYears: a2ContributeYears });
    const isaSeries = a1IsaSeries.map((v, i) => v + a2IsaSeries[i]);
    const a1SippSeries = fvSeries({ present: a1.sippBalance || 0, monthly: a1.sippMonthly || 0, annualRatePct: realSippGrowth, years });
    const a2SippSeries = fvSeries({ present: a2.sippBalance || 0, monthly: a2.sippMonthly || 0, annualRatePct: realSippGrowth, years, contributeYears: a2ContributeYears });
    const sippSeries = a1SippSeries.map((v, i) => v + a2SippSeries[i]);

    const combined = a1Series.map((v, i) => v + a2Series[i] + isaSeries[i] + sippSeries[i]);
    const totalAtRetirement = combined[combined.length - 1];
    const pensionAtRetirement = a1Series[a1Series.length - 1] + a2Series[a2Series.length - 1];
    const isaAtRetirement = isaSeries[isaSeries.length - 1];
    const sippAtRetirement = sippSeries[sippSeries.length - 1];

    const sustainableIncome = totalAtRetirement * (withdrawalRate / 100);
    const potNeeded = desiredIncome / (withdrawalRate / 100);

    // simulate drawdown post-retirement: pot keeps growing at a blend of each asset's own rate
    // while a fixed annual amount (the sustainable income above) is withdrawn, to see how long it lasts
    const weightedGrowth = totalAtRetirement > 0
      ? (pensionAtRetirement * realPensionGrowth + sippAtRetirement * realSippGrowth + isaAtRetirement * realIsaGrowth) / totalAtRetirement
      : 0;
    let potLastsYears = 0;
    if (totalAtRetirement > 0 && sustainableIncome > 0) {
      if (weightedGrowth >= withdrawalRate) {
        potLastsYears = Infinity;
      } else {
        let bal = totalAtRetirement;
        const maxYears = 100;
        while (bal > 0 && potLastsYears < maxYears) {
          bal = bal * (1 + weightedGrowth / 100) - sustainableIncome;
          potLastsYears++;
        }
        if (bal > 0) potLastsYears = Infinity;
      }
    }

    const a1AtStatePension = (a1.statePensionAge ?? 67) - a1.age;
    const a2AtStatePension = (a2.statePensionAge ?? 67) - a2.age;
    const bridgeYears = Math.max(0, (a1.statePensionAge ?? 67) - targetRetireAge);
    const combinedStatePension = (a1.statePensionAmount ?? 0) + (a2.statePensionAmount ?? 0);

    const mortgageClearYear = mortgageYearsLeft;
    const mortgageDoneByRetirement = mortgageNaturallyClear || mortgagePayoffAmount > 0;

    const netWorthNow = houseEquityNow + a1.pot + a2.pot + (a1.isaBalance || 0) + (a2.isaBalance || 0) + (a1.sippBalance || 0) + (a2.sippBalance || 0);

    const chartData = combined.map((v, i) => ({
      year: new Date().getFullYear() + i,
      age: a1.age + i,
      pot: Math.round(v),
      pension: Math.round(a1Series[i] + a2Series[i]),
      isa: Math.round(isaSeries[i]),
      sipp: Math.round(sippSeries[i]),
    }));

    return {
      totalAtRetirement, pensionAtRetirement, isaAtRetirement, sippAtRetirement, sustainableIncome, potNeeded, potLastsYears,
      bridgeYears, combinedStatePension, mortgageDoneByRetirement, mortgageClearYear, downsizeProceeds, mortgagePayoffAmount,
      houseEquityNow, netWorthNow, chartData, a1AtStatePension, a2AtStatePension, a1Monthly, a2Monthly,
    };
  }, [a1, a2, isaGrowth, sippGrowth, pensionGrowth, inflation, adjustForInflation, years, withdrawalRate, desiredIncome,
      targetRetireAge, a2TargetRetireAge, mortgageYearsLeft, houseValue, mortgageBalance,
      planToDownsize, downsizePropertyValue, payOffMortgageAtRetirement]);

  const shortfall = desiredIncome - calc.sustainableIncome;
  const onTrack = shortfall <= 0;

  // --- budget calc (planned vs actual, current period) ---
  const catColors = ["#C7A05E", "#4E9490", "#7BA383", "#5b7fa6", "#C06A57", "#9b7fc7", "#c78f5e", "#5eaac7"];
  const budgetCalc = useMemo(() => {
    const rows = categories.map((cat, i) => {
      const planned = cat.items.reduce((s, it) => s + (Number(it.planned) || 0), 0);
      const trackedItems = cat.items.filter((it) => currentActuals[it.id] !== undefined && currentActuals[it.id] !== "");
      const actual = trackedItems.reduce((s, it) => s + (Number(currentActuals[it.id]) || 0), 0);
      const hasActuals = trackedItems.length > 0;
      return { ...cat, planned, actual, hasActuals, color: catColors[i % catColors.length] };
    });
    const incomeRows = rows.filter((r) => r.type === "income");
    const expenseRows = rows.filter((r) => r.type !== "income");
    const totalIncomePlanned = incomeRows.reduce((s, r) => s + r.planned, 0);
    const totalIncomeActual = incomeRows.reduce((s, r) => s + r.actual, 0);
    const totalExpensePlanned = expenseRows.reduce((s, r) => s + r.planned, 0);
    const totalExpenseActual = expenseRows.reduce((s, r) => s + r.actual, 0);
    const surplusPlanned = totalIncomePlanned - totalExpensePlanned;
    const surplusActual = totalIncomeActual - totalExpenseActual;
    const anyActuals = rows.some((r) => r.hasActuals);
    const savingCat = expenseRows.find((r) => r.id === "saving");
    const savingsRate = totalIncomePlanned > 0 ? (((savingCat ? savingCat.planned : 0) + Math.max(surplusPlanned, 0)) / totalIncomePlanned) * 100 : 0;
    const pieData = expenseRows.filter((r) => r.planned > 0).map((r) => ({ name: r.name, value: r.planned, color: r.color }));
    const barData = rows.map((r) => ({ name: r.name, Planned: r.planned, Actual: r.hasActuals ? r.actual : null }));
    return { rows, incomeRows, expenseRows, totalIncomePlanned, totalIncomeActual, totalExpensePlanned, totalExpenseActual, surplusPlanned, surplusActual, anyActuals, savingsRate, pieData, barData };
  }, [categories, currentActuals]);
  const budgetBalanced = budgetCalc.surplusPlanned >= 0;

  return (
    <div className="fp-root">
      <style>{`
        .fp-root {
          --ink: #12181F;
          --panel: #1A222C;
          --panel-2: #212B37;
          --paper: #F6F2E9;
          --brass: #C7A05E;
          --brass-dim: #8a7346;
          --teal: #4E9490;
          --good: #7BA383;
          --bad: #C06A57;
          --text: #EDE7DA;
          --text-dim: #9BA3AE;
          --rule: #2C3742;
          font-family: 'Inter', sans-serif;
          background: var(--ink);
          color: var(--text);
          padding: 28px 18px 60px;
          min-height: 100vh;
          box-sizing: border-box;
        }
        .fp-root * { box-sizing: border-box; }
        .fp-header { max-width: 1180px; margin: 0 auto 22px; }
        .fp-eyebrow-main {
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-size: 11px;
          color: var(--brass);
        }
        .fp-title {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 34px;
          margin: 6px 0 4px;
          color: var(--text);
        }
        .fp-sub {
          color: var(--text-dim);
          font-size: 14px;
          max-width: 640px;
          line-height: 1.5;
        }

        /* ledger strip */
        .fp-strip {
          max-width: 1180px;
          margin: 22px auto;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
        }
        .fp-strip-item {
          padding: 14px 16px;
          border-left: 1px solid var(--rule);
        }
        .fp-strip-item:first-child { border-left: none; }
        .fp-strip-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-dim);
        }
        .fp-strip-value {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 22px;
          font-weight: 600;
          margin-top: 4px;
          color: var(--brass);
        }
        .fp-strip-value.good { color: var(--good); }
        .fp-strip-value.bad { color: var(--bad); }

        .fp-grid {
          max-width: 1180px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 860px) {
          .fp-grid { grid-template-columns: 1fr; }
        }

        .fp-col { display: flex; flex-direction: column; gap: 16px; }

        .fp-panel {
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 3px;
        }
        .fp-panel-head {
          padding: 14px 16px 10px;
          border-bottom: 1px solid var(--rule);
        }
        .fp-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--brass);
        }
        .fp-panel-title {
          font-family: 'Fraunces', serif;
          font-size: 18px;
          margin: 2px 0 0;
          font-weight: 600;
        }
        .fp-panel-body {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .fp-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .fp-field { display: flex; flex-direction: column; gap: 5px; }
        .fp-label {
          font-size: 12px;
          color: var(--text-dim);
        }
        .fp-input-row {
          display: flex;
          align-items: center;
          background: var(--panel-2);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 0 10px;
        }
        .fp-input-row:focus-within { border-color: var(--brass-dim); }
        .fp-unit { color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
        .fp-unit-suffix { color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .fp-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          padding: 9px 6px;
          width: 100%;
        }
        .fp-hint { font-size: 11px; color: var(--text-dim); opacity: 0.8; }

        .fp-slider-top { display: flex; justify-content: space-between; }
        .fp-slider-value {
          font-family: 'IBM Plex Mono', monospace;
          color: var(--brass);
          font-size: 13px;
        }
        .fp-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 3px;
          background: var(--rule);
          border-radius: 2px;
          outline: none;
        }
        .fp-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--brass);
          cursor: pointer;
          border: 2px solid var(--ink);
        }
        .fp-slider::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--brass);
          cursor: pointer;
          border: 2px solid var(--ink);
        }

        .fp-subhead {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-dim);
          margin-top: 2px;
          border-top: 1px dashed var(--rule);
          padding-top: 10px;
        }

        .fp-chart-card {
          background: var(--paper);
          color: var(--ink);
          border-radius: 3px;
          padding: 18px 16px 8px;
        }
        .fp-chart-title {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 18px;
          margin: 0 0 2px;
        }
        .fp-chart-sub {
          font-size: 12.5px;
          color: #5b5548;
          margin-bottom: 6px;
        }

        .fp-verdict {
          padding: 16px;
          border-radius: 3px;
          border: 1px solid var(--rule);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .fp-verdict.good { background: rgba(123,163,131,0.1); border-color: rgba(123,163,131,0.4); }
        .fp-verdict.bad { background: rgba(192,106,87,0.1); border-color: rgba(192,106,87,0.4); }
        .fp-verdict-text { font-size: 14px; line-height: 1.5; max-width: 640px; }
        .fp-verdict-num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 26px;
          font-weight: 600;
        }
        .fp-verdict-num.good { color: var(--good); }
        .fp-verdict-num.bad { color: var(--bad); }

        .fp-note {
          font-size: 12px;
          color: var(--text-dim);
          line-height: 1.6;
          border-top: 1px solid var(--rule);
          padding-top: 12px;
          margin-top: 4px;
        }

        /* tabs */
        .fp-tabs {
          max-width: 1180px;
          margin: 0 auto;
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--rule);
        }
        .fp-tab {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: transparent;
          border: none;
          color: var(--text-dim);
          padding: 10px 16px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }
        .fp-tab.active { color: var(--brass); border-bottom-color: var(--brass); }
        .fp-tab:hover:not(.active) { color: var(--text); }

        /* budget-specific */
        .fp-budget-grid {
          max-width: 1180px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 860px) {
          .fp-budget-grid { grid-template-columns: 1fr; }
        }

        .fp-period-bar {
          max-width: 1180px;
          margin: 16px auto 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }
        .fp-period-nav { display: flex; align-items: center; gap: 10px; }
        .fp-period-btn {
          background: var(--panel);
          border: 1px solid var(--rule);
          color: var(--text);
          width: 28px; height: 28px;
          border-radius: 3px;
          cursor: pointer;
          font-family: 'IBM Plex Mono', monospace;
        }
        .fp-period-btn:hover { border-color: var(--brass-dim); color: var(--brass); }
        .fp-period-label {
          font-family: 'Fraunces', serif;
          font-size: 16px;
          font-weight: 600;
          min-width: 140px;
          text-align: center;
        }
        .fp-period-type {
          display: flex;
          border: 1px solid var(--rule);
          border-radius: 3px;
          overflow: hidden;
        }
        .fp-period-type button {
          background: var(--panel);
          border: none;
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          text-transform: uppercase;
          padding: 6px 10px;
          cursor: pointer;
        }
        .fp-period-type button.active { background: var(--brass); color: var(--ink); }
        .fp-save-status {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          color: var(--text-dim);
          letter-spacing: 0.04em;
        }
        .fp-save-status.saved { color: var(--good); }
        .fp-save-status.unavailable { color: var(--bad); }

        .fp-cat-card { }
        .fp-cat-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .fp-cat-name-input {
          display: block;
          background: transparent;
          border: none;
          color: var(--text);
          font-family: 'Fraunces', serif;
          font-size: 18px;
          font-weight: 600;
          padding: 2px 0 0;
          outline: none;
          width: 100%;
          border-bottom: 1px solid transparent;
        }
        .fp-cat-name-input:focus { border-bottom-color: var(--brass-dim); }

        .fp-item-col-heads {
          display: grid;
          grid-template-columns: 1fr 100px 100px 24px;
          gap: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-dim);
          padding-bottom: 2px;
        }
        .fp-item-row {
          display: grid;
          grid-template-columns: 1fr 100px 24px;
          align-items: center;
          gap: 8px;
        }
        .fp-item-row.with-actuals { grid-template-columns: 1fr 100px 100px 24px; }
        .fp-lineitem-label-input {
          background: transparent;
          border: none;
          border-bottom: 1px dashed var(--rule);
          color: var(--text);
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          padding: 4px 0;
          outline: none;
        }
        .fp-lineitem-label-input:focus { border-bottom-color: var(--brass-dim); }
        .fp-lineitem-amount {
          display: flex;
          align-items: center;
          background: var(--panel-2);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 0 8px;
        }
        .fp-lineitem-amount.actual { border-color: var(--teal); }
        .fp-lineitem-amount .fp-input { padding: 6px 4px; font-size: 13px; }
        .fp-remove-btn {
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--text-dim);
          width: 24px; height: 24px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
        }
        .fp-remove-btn:hover { color: var(--bad); border-color: var(--bad); }
        .fp-lineitem-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px dashed var(--rule);
        }
        .fp-add-btn {
          background: transparent;
          border: none;
          color: var(--brass);
          font-size: 12px;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          padding: 0;
        }
        .fp-add-btn:hover { text-decoration: underline; }
        .fp-lineitem-total {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--text-dim);
          margin-left: auto;
        }
        .fp-add-cat-btn {
          background: transparent;
          border: 1px dashed var(--rule);
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 12px;
          border-radius: 3px;
          cursor: pointer;
          text-align: center;
        }
        .fp-add-cat-btn:hover { color: var(--brass); border-color: var(--brass-dim); }

        .fp-variance-table { display: flex; flex-direction: column; gap: 6px; }
        .fp-variance-row {
          display: grid;
          grid-template-columns: 1fr 80px 80px 80px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 4px 0;
          border-bottom: 1px dashed #e3ddc9;
          color: #3a352a;
        }
        .fp-variance-row.head {
          color: #5b5548;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #cfc7ac;
        }
        .fp-variance-row .num { text-align: right; }
        .fp-variance-row .good { color: #4c7a53; }
        .fp-variance-row .bad { color: #a8433a; }

        .fp-sync-btn {
          background: transparent;
          border: 1px solid var(--brass-dim);
          color: var(--brass);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          padding: 6px 10px;
          border-radius: 3px;
          cursor: pointer;
        }
        .fp-sync-btn:hover { background: rgba(199,160,94,0.1); }
        .fp-sync-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .fp-scenario-save { display: flex; gap: 8px; }
        .fp-scenario-name-input {
          flex: 1;
          background: var(--panel-2);
          border: 1px solid var(--rule);
          border-radius: 3px;
          color: var(--text);
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          padding: 8px 10px;
          outline: none;
        }
        .fp-scenario-name-input:focus { border-color: var(--brass-dim); }
        .fp-scenario-list { display: flex; flex-direction: column; gap: 6px; }
        .fp-scenario-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px dashed var(--rule);
        }
        .fp-scenario-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .fp-scenario-name { font-size: 13px; }
        .fp-scenario-meta {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--text-dim);
        }

        .fp-checkbox-row { display: flex; align-items: center; gap: 8px; }
        .fp-checkbox { width: 15px; height: 15px; accent-color: var(--brass); cursor: pointer; }
        .fp-checkbox-field .fp-label { cursor: pointer; }

        .fp-about-wrap {
          max-width: 900px;
          margin: 20px auto 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .fp-bullet-list {
          margin: 0;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text);
        }
        .fp-bullet-list strong { color: var(--brass); font-weight: 600; }

        .fp-export-btn {
          background: transparent;
          border: 1px solid var(--brass-dim);
          color: var(--brass);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.04em;
          padding: 8px 14px;
          border-radius: 3px;
          cursor: pointer;
        }
        .fp-export-btn:hover { background: rgba(199,160,94,0.1); }

        .fp-yaxis-control {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin: 6px 0 10px;
          font-size: 12px;
          color: #5b5548;
        }
        .fp-yaxis-control label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .fp-yaxis-control input[type="checkbox"] {
          accent-color: #C7A05E;
          cursor: pointer;
        }
        .fp-yaxis-input-wrap {
          display: flex;
          align-items: center;
          gap: 3px;
          background: #fff;
          border: 1px solid #cfc7ac;
          border-radius: 3px;
          padding: 3px 8px;
        }
        .fp-yaxis-input-wrap input {
          border: none;
          outline: none;
          background: transparent;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          width: 90px;
          color: #12181F;
        }

        .fp-print-only { display: none; }
        @media print {
          .fp-screen-only { display: none !important; }
          .fp-print-only { display: block !important; }
        }
        .fp-print-only {
          max-width: 720px;
          margin: 0 auto;
          padding: 24px;
          color: #12181F;
          background: #fff;
          font-family: 'Inter', sans-serif;
        }
        .fp-print-only h1 {
          font-family: 'Fraunces', serif;
          font-size: 26px;
          font-weight: 600;
          margin: 0 0 4px;
        }
        .fp-print-sub {
          font-size: 12px;
          color: #5b5548;
          margin-bottom: 22px;
        }
        .fp-print-only h2 {
          font-family: 'Fraunces', serif;
          font-size: 16px;
          font-weight: 600;
          margin: 22px 0 8px;
          border-bottom: 1px solid #cfc7ac;
          padding-bottom: 4px;
        }
        .fp-print-only table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .fp-print-only td { padding: 5px 0; border-bottom: 1px dashed #e3ddc9; }
        .fp-print-only td:last-child { text-align: right; font-family: 'IBM Plex Mono', monospace; }
        .fp-print-verdict {
          padding: 12px 14px;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.5;
        }
        .fp-print-verdict.good { background: #eef4ee; border: 1px solid #7BA383; }
        .fp-print-verdict.bad { background: #fbeeec; border: 1px solid #C06A57; }
        .fp-print-foot {
          margin-top: 30px;
          font-size: 10px;
          color: #8a8578;
          border-top: 1px solid #e3ddc9;
          padding-top: 10px;
          line-height: 1.5;
        }
      `}</style>

      <div className="fp-screen-only">
      <div className="fp-header">
        <div className="fp-eyebrow-main">Household Ledger</div>
        <div className="fp-title">Financial plan, worked in numbers</div>
        <div className="fp-sub">
          Adjust the figures on the left. Every projection assumes steady contributions and constant
          growth rates — reality will be lumpier. Use this to find the shape of the plan, not the final answer.
        </div>
        <button className="fp-export-btn" onClick={() => window.print()} style={{ marginTop: 14 }}>
          ↓ Export summary (PDF)
        </button>
      </div>

      <div className="fp-tabs">
        <button className={`fp-tab ${tab === "retirement" ? "active" : ""}`} onClick={() => setTab("retirement")}>Retirement plan</button>
        <button className={`fp-tab ${tab === "budget" ? "active" : ""}`} onClick={() => setTab("budget")}>Household budget</button>
        <button className={`fp-tab ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>How it works</button>
      </div>

      {tab === "retirement" && (
      <>
      <div className="fp-strip">
        <div className="fp-strip-item">
          <div className="fp-strip-label">Years to target retirement</div>
          <div className="fp-strip-value">{years}</div>
        </div>
        <div className="fp-strip-item">
          <div className="fp-strip-label">Net worth today</div>
          <div className="fp-strip-value">{gbpK(calc.netWorthNow)}</div>
        </div>
        <div className="fp-strip-item">
          <div className="fp-strip-label">Projected pot at {targetRetireAge}</div>
          <div className="fp-strip-value">{gbpK(calc.totalAtRetirement)}</div>
        </div>
        <div className="fp-strip-item">
          <div className="fp-strip-label">Sustainable income</div>
          <div className={`fp-strip-value ${onTrack ? "good" : "bad"}`}>{gbpK(calc.sustainableIncome)}/yr</div>
        </div>
        <div className="fp-strip-item">
          <div className="fp-strip-label">Mortgage clear by retirement?</div>
          <div className={`fp-strip-value ${calc.mortgageDoneByRetirement ? "good" : "bad"}`}>
            {calc.mortgageDoneByRetirement ? "Yes" : "No"}
          </div>
        </div>
      </div>

      <div className="fp-grid">
        {/* LEFT: INPUTS */}
        <div className="fp-col">
          <Section eyebrow="Scenarios" title="Save & compare">
            <div className="fp-scenario-save">
              <input
                className="fp-scenario-name-input"
                type="text"
                placeholder="Scenario name…"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveScenario(); }}
              />
              <button className="fp-sync-btn" onClick={saveScenario} disabled={!scenarioName.trim()}>Save current</button>
            </div>
            {Object.keys(scenarios).length === 0 ? (
              <span className="fp-hint">No scenarios saved yet — dial in the numbers below, then save this as a named scenario to compare later.</span>
            ) : (
              <div className="fp-scenario-list">
                {Object.keys(scenarios).sort().map((name) => {
                  const s = scenarios[name];
                  return (
                    <div className="fp-scenario-row" key={name}>
                      <div className="fp-scenario-info">
                        <span className="fp-scenario-name">{name}</span>
                        <span className="fp-scenario-meta">
                          {s.targetRetireAge !== undefined && `Retire at ${s.targetRetireAge}`}
                          {s.targetRetireAge !== undefined && s.desiredIncome !== undefined && " · "}
                          {s.desiredIncome !== undefined && `${gbp(s.desiredIncome)}/yr`}
                        </span>
                      </div>
                      <button className="fp-add-btn" onClick={() => loadScenario(name)}>Load</button>
                      <button
                        className="fp-remove-btn"
                        onClick={() => { if (window.confirm(`Delete the scenario "${name}"? This can't be undone.`)) deleteScenario(name); }}
                        aria-label={`Delete ${name}`}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
            <span className={`fp-save-status ${saveStatus}`}>
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "✓ Synced to this device"}
              {saveStatus === "unavailable" && "Storage unavailable — changes won't persist"}
            </span>
          </Section>

          <Section eyebrow="Individual" title={personTab === "a1" ? (a1.name || "Adult 1") : (a2.name || "Adult 2")}>
            <div className="fp-period-type">
              <button className={personTab === "a1" ? "active" : ""} onClick={() => setPersonTab("a1")}>{a1.name || "Adult 1"}</button>
              <button className={personTab === "a2" ? "active" : ""} onClick={() => setPersonTab("a2")}>{a2.name || "Adult 2"}</button>
            </div>
            {personTab === "a1" ? (
              <PersonPanel
                person={a1}
                onChange={setA1}
                retireAgeValue={targetRetireAge}
                onRetireAgeChange={setTargetRetireAge}
                stepMaxAge={targetRetireAge}
                monthlyPayment={calc.a1Monthly}
              />
            ) : (
              <PersonPanel
                person={a2}
                onChange={setA2}
                retireAgeValue={a2TargetRetireAge}
                onRetireAgeChange={setA2TargetRetireAge}
                retireAgeHint="If earlier than the household horizon (Adult 1's retirement age), their own pension & ISA/SIPP contributions stop at this age."
                stepMaxAge={a2TargetRetireAge}
                monthlyPayment={calc.a2Monthly}
              />
            )}
          </Section>

          <Section eyebrow="Property & mortgage" title="House">
            <div className="fp-two-col">
              <Field label="House value" unit="£" value={houseValue} step={5000} onChange={setHouseValue} />
              <Field label="Mortgage balance" unit="£" value={mortgageBalance} step={5000} onChange={setMortgageBalance} />
            </div>
            <div className="fp-two-col">
              <Field label="Monthly payment" unit="£" value={mortgagePayment} step={50} onChange={setMortgagePayment} />
              <Field label="Years left on term" value={mortgageYearsLeft} onChange={setMortgageYearsLeft} />
            </div>
            <label className="fp-field fp-checkbox-field">
              <span className="fp-checkbox-row">
                <input
                  type="checkbox"
                  className="fp-checkbox"
                  checked={planToDownsize}
                  onChange={(e) => setPlanToDownsize(e.target.checked)}
                />
                <span className="fp-label">Plan to downsize at retirement</span>
              </span>
            </label>
            {planToDownsize && (
              <Field
                label="New (downsized) property value"
                unit="£"
                value={downsizePropertyValue}
                step={5000}
                onChange={setDownsizePropertyValue}
                hint="Assumes no new mortgage — the gap between today's equity and this value is added to your pot at retirement."
              />
            )}
            <label className="fp-field fp-checkbox-field">
              <span className="fp-checkbox-row">
                <input
                  type="checkbox"
                  className="fp-checkbox"
                  checked={payOffMortgageAtRetirement}
                  onChange={(e) => setPayOffMortgageAtRetirement(e.target.checked)}
                />
                <span className="fp-label">Pay off mortgage at retirement age</span>
              </span>
              <span className="fp-hint">If the mortgage would still be running at retirement, this draws today's remaining balance out of savings to clear it — doesn't account for paydown or house price growth between now and then.</span>
            </label>
          </Section>

          <Section eyebrow="Outgoings" title="Household costs">
            <Field label="Monthly household outgoings" unit="£" value={monthlyOutgoings} step={50} onChange={setMonthlyOutgoings} hint="Bills, food, childcare, transport — everything outside the mortgage & pension. For reference only — has no bearing on the projected pot or sustainable income." />
          </Section>
        </div>

        {/* RIGHT: OUTPUTS */}
        <div className="fp-col">
          <Section eyebrow="Assumptions" title="Rates & retirement">
            <div className="fp-two-col">
              <Field label="Pension growth" unit="%/yr" value={pensionGrowth} step={0.5} onChange={setPensionGrowth} />
              <Field label="ISA growth" unit="%/yr" value={isaGrowth} step={0.5} onChange={setIsaGrowth} />
            </div>
            <Field label="SIPP growth" unit="%/yr" value={sippGrowth} step={0.5} onChange={setSippGrowth} hint="Held and grown separately from employer pension pots." />
            <Field label="Inflation" unit="%/yr" value={inflation} step={0.5} onChange={setInflation} />
            <label className="fp-field fp-checkbox-field">
              <span className="fp-checkbox-row">
                <input
                  type="checkbox"
                  className="fp-checkbox"
                  checked={adjustForInflation}
                  onChange={(e) => setAdjustForInflation(e.target.checked)}
                />
                <span className="fp-label">Adjust for inflation</span>
              </span>
              <span className="fp-hint">Growth rates are reduced by the inflation rate above, so every figure below is shown in today's money.</span>
            </label>
            <div className="fp-subhead">Desired outcome</div>
            <Field label="Desired retirement income" unit="£/yr" value={desiredIncome} step={500} onChange={setDesiredIncome} hint="In today's money — what you'd want to live on." />
          </Section>

          <div className={`fp-verdict ${onTrack ? "good" : "bad"}`}>
            <div className="fp-verdict-text">
              {onTrack
                ? `At these numbers, your projected pot at ${targetRetireAge} supports your ${gbp(desiredIncome)}/yr target with room to spare.`
                : `At these numbers, your projected pot at ${targetRetireAge} falls short of your ${gbp(desiredIncome)}/yr target. You'd need roughly ${gbp(calc.potNeeded)} total to sustain it at a ${withdrawalRate}% withdrawal rate.`}
            </div>
            <div className={`fp-verdict-num ${onTrack ? "good" : "bad"}`}>
              {onTrack ? "+" : "−"}{gbp(Math.abs(shortfall))}/yr
            </div>
          </div>

          <div className="fp-chart-card">
            <div className="fp-chart-title">Pot growth to age {targetRetireAge}{adjustForInflation ? " (today's money)" : ""}</div>
            <div className="fp-chart-sub">Combined pension + SIPP + ISA/savings balance, year by year. Dotted line marks the pot size needed to sustain {gbp(desiredIncome)}/yr.</div>
            <div className="fp-yaxis-control">
              <label>
                <input
                  type="checkbox"
                  checked={yAxisMaxEnabled}
                  onChange={(e) => setYAxisMaxEnabled(e.target.checked)}
                />
                <span>Fix Y-axis maximum</span>
              </label>
              {yAxisMaxEnabled && (
                <span className="fp-yaxis-input-wrap">
                  <span>£</span>
                  <input
                    type="number"
                    value={yAxisMax}
                    step={50000}
                    min={0}
                    onChange={(e) => setYAxisMax(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                  />
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={calc.chartData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="pensionFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4E9490" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#4E9490" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="sippFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b7fa6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#5b7fa6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="isaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C7A05E" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#C7A05E" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c0" />
                <XAxis dataKey="age" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#5b5548" }} tickLine={false} axisLine={{ stroke: "#c9c1ac" }} label={{ value: `${a1.name || "Adult 1"} age`, position: "insideBottom", offset: -3, fontSize: 11, fill: "#5b5548" }} />
                <YAxis domain={yAxisMaxEnabled ? [0, yAxisMax] : [0, "auto"]} allowDataOverflow={yAxisMaxEnabled} tickFormatter={gbpK} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#5b5548" }} tickLine={false} axisLine={false} width={54} />
                <Tooltip content={<PotTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <ReferenceLine y={calc.potNeeded} stroke="#C06A57" strokeDasharray="4 4" label={{ value: "Pot needed", fontSize: 10, fill: "#C06A57", position: "insideTopRight" }} />
                <Area type="monotone" dataKey="pension" name="Pension" stackId="1" stroke="#3d7d79" fill="url(#pensionFill)" />
                <Area type="monotone" dataKey="sipp" name="SIPP" stackId="1" stroke="#3f5c7a" fill="url(#sippFill)" />
                <Area type="monotone" dataKey="isa" name="ISA / savings" stackId="1" stroke="#a3813f" fill="url(#isaFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="fp-panel">
            <div className="fp-panel-body">
              <Slider label="Withdrawal rate" value={withdrawalRate} min={2} max={7} step={0.25} onChange={setWithdrawalRate} display={(v) => `${v}%`} />
              <span className="fp-hint">
                {calc.potLastsYears === Infinity
                  ? `At this rate, the pot's growth keeps pace with withdrawals — on these assumptions, it doesn't run out.`
                  : `At this rate, the pot runs out after about ${calc.potLastsYears} year${calc.potLastsYears === 1 ? "" : "s"} of retirement (around age ${targetRetireAge + calc.potLastsYears}).`}
              </span>
            </div>
          </div>

          <Section eyebrow="Breakdown" title="Where the numbers land">
            <div className="fp-two-col">
              <Field label="Pension pot at retirement" unit="£" value={Math.round(calc.pensionAtRetirement)} onChange={() => {}} readOnly />
              <Field label="SIPP pot at retirement" unit="£" value={Math.round(calc.sippAtRetirement)} onChange={() => {}} readOnly />
            </div>
            <div className="fp-two-col">
              <Field label="ISA/savings pot at retirement" unit="£" value={Math.round(calc.isaAtRetirement)} onChange={() => {}} readOnly />
              <Field label="Combined state pension (both adults)" unit="£/yr" value={calc.combinedStatePension} onChange={() => {}} readOnly hint={`From age ${a1.statePensionAge ?? 67} (${a1.name || "Adult 1"}) and age ${a2.statePensionAge ?? 67} (${a2.name || "Adult 2"}).`} />
            </div>
            {planToDownsize && (
              <Field label="Downsizing equity released" unit="£" value={Math.round(calc.downsizeProceeds)} onChange={() => {}} readOnly hint="Included in the pot & sustainable income above, based on today's equity — doesn't account for house price growth or mortgage paydown between now and retirement." />
            )}
            {calc.mortgagePayoffAmount > 0 && (
              <Field label="Mortgage paid off from savings" unit="£" value={Math.round(calc.mortgagePayoffAmount)} onChange={() => {}} readOnly hint="Drawn from the ISA/savings pot at retirement, based on today's remaining balance." />
            )}
            <Field label="Years before state pension kicks in" value={calc.bridgeYears} onChange={() => {}} readOnly hint="Income needed to bridge from your pot alone during this gap." />
            <div className="fp-note">
              {planToDownsize
                ? `House equity (${gbp(calc.houseEquityNow)} today) is excluded from net worth's "pot" figure except for the ${gbp(calc.downsizeProceeds)} downsizing releases at retirement (added above) — the rest is assumed to stay tied up in the smaller property.`
                : `House equity (${gbp(calc.houseEquityNow)} today) is excluded from the retirement pot above — it's shown in net worth, but this framework assumes you're not planning to draw it down (tick "Plan to downsize" above to model releasing some of it).`}
              {" "}Mortgage: at {mortgageYearsLeft} years remaining,
              it {calc.mortgageDoneByRetirement ? "clears before or is paid off by" : "is still running at"} your target retirement age
              {calc.mortgagePayoffAmount > 0 ? ` (paid off from savings — see ${gbp(calc.mortgagePayoffAmount)} above)` : ""}.
              State pension is added on top of the withdrawal figure once each adult reaches their own state pension age,
              not before.
            </div>
          </Section>
        </div>
      </div>
      </>
      )}

      {tab === "budget" && (
      <>
      <div className="fp-period-bar">
        <div className="fp-period-nav">
          <button className="fp-period-btn" onClick={() => shiftPeriod(-1)} aria-label="Previous period">‹</button>
          <span className="fp-period-label">{periodLabel(periodDate, periodType)}</span>
          <button className="fp-period-btn" onClick={() => shiftPeriod(1)} aria-label="Next period">›</button>
          <div className="fp-period-type">
            <button className={periodType === "monthly" ? "active" : ""} onClick={() => setPeriodType("monthly")}>Monthly</button>
            <button className={periodType === "quarterly" ? "active" : ""} onClick={() => setPeriodType("quarterly")}>Quarterly</button>
          </div>
        </div>
        <span className={`fp-save-status ${saveStatus}`}>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "✓ Synced to this device"}
          {saveStatus === "unavailable" && "Storage unavailable — changes won't persist"}
        </span>
      </div>

      <div className="fp-budget-grid" style={{ marginTop: 14 }}>
        <div className="fp-col">
          <div className="fp-note" style={{ borderTop: "none", paddingTop: 0, maxWidth: 480 }}>
            Planned figures carry over between periods. Actuals are entered per {periodType === "monthly" ? "month" : "quarter"} —
            switch periods above to log a different one; nothing you've already entered gets overwritten.
          </div>
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              actuals={currentActuals}
              showActuals
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onRename={renameCategory}
              onRemoveCategory={removeCategory}
              onSetActual={setActual}
            />
          ))}
          <button className="fp-add-cat-btn" onClick={addCategory}>+ Add category</button>
        </div>

        <div className="fp-col">
          <div className={`fp-verdict ${budgetBalanced ? "good" : "bad"}`}>
            <div className="fp-verdict-text">
              {budgetBalanced
                ? `Planned income covers planned outgoings, with a monthly surplus left over.`
                : `Planned outgoings currently run ahead of planned income.`}
              {budgetCalc.anyActuals && (
                <> Actuals logged so far this {periodType === "monthly" ? "month" : "quarter"} put you at {budgetCalc.surplusActual >= 0 ? "+" : "−"}{gbp(Math.abs(budgetCalc.surplusActual))}.</>
              )}
            </div>
            <div className={`fp-verdict-num ${budgetBalanced ? "good" : "bad"}`}>
              {budgetBalanced ? "+" : "−"}{gbp(Math.abs(budgetCalc.surplusPlanned))}/mo
            </div>
          </div>

          <div className="fp-chart-card">
            <div className="fp-chart-title">Planned vs. actual, {periodLabel(periodDate, periodType)}</div>
            <div className="fp-chart-sub">
              {budgetCalc.anyActuals
                ? "Bars compare what you budgeted against what you've logged for this period so far."
                : "No actuals logged yet for this period — enter them on the left to see the comparison."}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={budgetCalc.barData} margin={{ top: 6, right: 10, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5b5548" }} tickLine={false} axisLine={{ stroke: "#c9c1ac" }} angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis tickFormatter={gbpK} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#5b5548" }} tickLine={false} axisLine={false} width={50} />
                <Tooltip formatter={(v) => (v == null ? "not logged" : gbp(v))} contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12, borderRadius: 3 }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <Bar dataKey="Planned" fill="#C7A05E" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Actual" fill="#4E9490" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Section eyebrow="Summary" title={`${periodType === "monthly" ? "Monthly" : "Quarterly"} position`}>
            <div className="fp-two-col">
              <Field label="Total planned income" unit="£" value={Math.round(budgetCalc.totalIncomePlanned)} onChange={() => {}} readOnly />
              <Field label="Total planned outgoings" unit="£" value={Math.round(budgetCalc.totalExpensePlanned)} onChange={() => {}} readOnly />
            </div>
            <div className="fp-two-col">
              <Field label="Planned surplus / deficit" unit="£" value={Math.round(budgetCalc.surplusPlanned)} onChange={() => {}} readOnly />
              <Field label="Savings rate" unit="%" value={budgetCalc.savingsRate.toFixed(1)} onChange={() => {}} readOnly hint="Share of planned income going to saving + surplus." />
            </div>

            {budgetCalc.anyActuals && (
              <div className="fp-chart-card" style={{ marginTop: 4 }}>
                <div className="fp-chart-title" style={{ fontSize: 15 }}>Variance by category</div>
                <div className="fp-variance-table">
                  <div className="fp-variance-row head"><span>Category</span><span className="num">Planned</span><span className="num">Actual</span><span className="num">Variance</span></div>
                  {budgetCalc.rows.filter((r) => r.hasActuals).map((r) => {
                    const variance = r.actual - r.planned;
                    const good = r.type === "income" ? variance >= 0 : variance <= 0;
                    return (
                      <div className="fp-variance-row" key={r.id}>
                        <span>{r.name}</span>
                        <span className="num">{gbp(r.planned)}</span>
                        <span className="num">{gbp(r.actual)}</span>
                        <span className={`num ${good ? "good" : "bad"}`}>{variance >= 0 ? "+" : "−"}{gbp(Math.abs(variance))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="fp-note">
              Planned outgoings this tab total {gbp(budgetCalc.totalExpensePlanned)}/mo
              {Math.abs(budgetCalc.totalExpensePlanned - monthlyOutgoings) > 1
                ? `, which differs from the ${gbp(monthlyOutgoings)}/mo "household outgoings" figure used on the Retirement tab.`
                : `, matching the figure used on the Retirement tab.`}
            </div>
            <button className="fp-sync-btn" onClick={() => setMonthlyOutgoings(Math.round(budgetCalc.totalExpensePlanned))}>
              ↳ Use this total on the Retirement tab
            </button>
          </Section>
        </div>
      </div>
      </>
      )}

      {tab === "about" && (
      <>
      <div className="fp-about-wrap">
        <Section eyebrow="Overview" title="How this tool works">
          <ul className="fp-bullet-list">
            <li>Everything runs locally in your browser — there's no server or account. Data is saved to this browser's storage only, so it won't follow you to a different browser or device.</li>
            <li>Two tabs handle different questions: <strong>Retirement plan</strong> projects your pension/savings pots forward to see if you're on track, and <strong>Household budget</strong> tracks monthly planned-vs-actual spending. They're independent — the budget tab has its own "use this total on the Retirement tab" button if you want to sync the outgoings figure, but nothing else crosses over automatically.</li>
          </ul>
        </Section>

        <Section eyebrow="Retirement plan tab" title="How the projection is built">
          <ul className="fp-bullet-list">
            <li>Each adult's own numbers — age, income, pension contribution %, employer contribution %, current pension pot, target retirement age, step changes, ISA, SIPP, state pension, and inheritance — live under an <strong>Individual</strong> panel with a switcher to flip between them. Both adults' panels have exactly the same fields, so nothing is Adult-1-only. Shared household concerns (property, mortgage, outgoings, assumptions) sit in their own sections outside that switcher.</li>
            <li>The overall projection horizon is anchored to Adult 1 reaching their target retirement age — that's what the chart, "years to target retirement," and "projected pot" figures are built around.</li>
            <li>Adult 2 can retire at a different age. If earlier than the household horizon, their own pension, ISA, and SIPP contributions stop at that point (their pots then just keep growing on interest); if later, they keep contributing for the whole projection since they haven't retired yet within it.</li>
            <li>ISA and <strong>SIPP</strong> (personal pension) balances and contributions are set per adult, each held and grown separately from their employer pension pot; the ISA and SIPP growth rates are shared assumptions (like pension growth), since they're market assumptions rather than something that varies person to person.</li>
            <li>Each adult can add a one-off <strong>inheritance</strong> as a lump sum into their own pension pot at whichever age you choose (defaulting to "received now" if set to their current age).</li>
            <li>Each adult can also set a <strong>step change in pension payment</strong> — a new monthly £ amount that replaces the calculated one from a chosen age onward, for modelling a raise, a lump-sum contribution increase, or cutting back before retirement.</li>
            <li>Ticking <strong>"plan to downsize"</strong> models selling the house and buying a smaller one with no new mortgage — the gap between today's equity and the new property's value is released into the pot at retirement. Left unticked, house equity only counts toward net worth today and has no bearing on the pot.</li>
            <li>Ticking <strong>"pay off mortgage at retirement age"</strong> models clearing a still-running mortgage using savings at the retirement point, drawing down today's remaining balance from the ISA/savings pot. It only does anything if the mortgage wouldn't naturally clear before retirement anyway.</li>
            <li>The <strong>house value</strong> and <strong>mortgage balance</strong> fields otherwise only feed "net worth today" and the mortgage payoff note — they don't affect the pension projection.</li>
            <li><strong>Monthly household outgoings</strong> is reference-only — it doesn't feed into any calculation, it's just there to compare against your actual budget.</li>
            <li>Growth rates, inflation, and desired retirement income live in <strong>Assumptions</strong> (top right). Ticking <strong>"adjust for inflation"</strong> strips the inflation rate out of every growth rate, so the whole projection — chart, pot, sustainable income — is shown in today's money instead of inflated future pounds.</li>
            <li><strong>State pension</strong> age and annual amount are set per adult (in their own Individual panel), since both can genuinely differ person to person. The combined total is added on top of the withdrawal figure once each adult individually reaches their own state pension age — not before, and not at a shared age.</li>
            <li>The <strong>withdrawal rate</strong> slider (between the chart and the breakdown) converts your projected pot into a yearly income (pot × rate), and also drives the "pot lasts about N years" estimate — a higher rate means a smaller pot is "needed" for the same income, but also means the pot depletes faster.</li>
            <li>"Fix Y-axis maximum" (above the chart) is a display-only option — it caps the chart's vertical scale at a value you choose, useful for keeping the axis consistent while comparing scenarios. It doesn't affect any figures, only how the chart is drawn.</li>
            <li>Hovering the chart shows Pension, SIPP, and ISA/savings for that year individually, plus a <strong>Total pension pot</strong> line summing all three — the same total plotted implicitly by the stacked area heights.</li>
            <li><strong>Scenarios</strong> let you save the entire set of retirement inputs under a name, then load or delete them later to compare different what-ifs (e.g. "early retirement" vs "base case").</li>
          </ul>
        </Section>

        <Section eyebrow="Household budget tab" title="Planned vs actual">
          <ul className="fp-bullet-list">
            <li>Income and expenses are grouped into editable categories, each with line items you can add, rename, or remove.</li>
            <li>Switch between monthly and quarterly periods, and step back/forward through them — planned figures carry over between periods, but actuals are tracked per period so nothing you've logged gets overwritten.</li>
            <li>The chart and variance table compare what you planned against what you've actually logged for the current period.</li>
          </ul>
        </Section>

        <Section eyebrow="A note on this page" title="Kept up to date">
          <ul className="fp-bullet-list">
            <li>This overview is meant to track the app as features get added or changed — if something here looks out of date, it's a bug worth flagging.</li>
          </ul>
        </Section>
      </div>
      </>
      )}
      </div>

      <div className="fp-print-only">
        <h1>Financial plan — executive summary</h1>
        <div className="fp-print-sub">
          Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {" · "}{a1.name || "Adult 1"} (age {a1.age}){a2.name || a2.age ? ` & ${a2.name || "Adult 2"} (age ${a2.age})` : ""}
        </div>

        <div className={`fp-print-verdict ${onTrack ? "good" : "bad"}`}>
          {onTrack
            ? `On these numbers, the projected pot at age ${targetRetireAge} supports the ${gbp(desiredIncome)}/yr target, with a surplus of ${gbp(Math.abs(shortfall))}/yr.`
            : `On these numbers, the projected pot at age ${targetRetireAge} falls short of the ${gbp(desiredIncome)}/yr target by ${gbp(Math.abs(shortfall))}/yr. Roughly ${gbp(calc.potNeeded)} total would be needed at a ${withdrawalRate}% withdrawal rate.`}
        </div>

        <h2>Key figures</h2>
        <table>
          <tbody>
            <tr><td>Years to target retirement</td><td>{years}</td></tr>
            <tr><td>Net worth today</td><td>{gbp(calc.netWorthNow)}</td></tr>
            <tr><td>Projected pot at age {targetRetireAge}</td><td>{gbp(calc.totalAtRetirement)}</td></tr>
            <tr><td>Sustainable income at {withdrawalRate}% withdrawal rate</td><td>{gbp(calc.sustainableIncome)}/yr</td></tr>
            <tr><td>Pot longevity at that rate</td><td>{calc.potLastsYears === Infinity ? "Doesn't run out" : `~${calc.potLastsYears} years`}</td></tr>
            <tr><td>Mortgage clear by retirement</td><td>{calc.mortgageDoneByRetirement ? "Yes" : "No"}</td></tr>
          </tbody>
        </table>

        <h2>Pot breakdown at retirement</h2>
        <table>
          <tbody>
            <tr><td>Pension (both adults)</td><td>{gbp(calc.pensionAtRetirement)}</td></tr>
            <tr><td>SIPP (both adults)</td><td>{gbp(calc.sippAtRetirement)}</td></tr>
            <tr><td>ISA / savings (both adults)</td><td>{gbp(calc.isaAtRetirement)}</td></tr>
            <tr><td>Combined state pension (both adults)</td><td>{gbp(calc.combinedStatePension)}/yr</td></tr>
          </tbody>
        </table>

        {((a1.inheritanceAmount ?? 0) > 0 || (a2.inheritanceAmount ?? 0) > 0 || planToDownsize || (calc.mortgagePayoffAmount ?? 0) > 0 || a1.stepEnabled || a2.stepEnabled) && (
          <>
            <h2>One-off & planned changes</h2>
            <table>
              <tbody>
                {(a1.inheritanceAmount ?? 0) > 0 && (
                  <tr><td>Inheritance, received at age {a1.inheritanceAge} ({a1.name || "Adult 1"})</td><td>{gbp(a1.inheritanceAmount)}</td></tr>
                )}
                {(a2.inheritanceAmount ?? 0) > 0 && (
                  <tr><td>Inheritance, received at age {a2.inheritanceAge} ({a2.name || "Adult 2"})</td><td>{gbp(a2.inheritanceAmount)}</td></tr>
                )}
                {planToDownsize && (
                  <tr><td>Downsizing equity released at retirement</td><td>{gbp(calc.downsizeProceeds)}</td></tr>
                )}
                {(calc.mortgagePayoffAmount ?? 0) > 0 && (
                  <tr><td>Mortgage paid off from savings at retirement</td><td>{gbp(calc.mortgagePayoffAmount)}</td></tr>
                )}
                {a1.stepEnabled && (
                  <tr><td>{a1.name || "Adult 1"}: pension payment steps to {gbp(a1.stepAmount ?? 0)}/mo at age {a1.stepAge}</td><td></td></tr>
                )}
                {a2.stepEnabled && (
                  <tr><td>{a2.name || "Adult 2"}: pension payment steps to {gbp(a2.stepAmount ?? 0)}/mo at age {a2.stepAge}</td><td></td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <h2>Assumptions used</h2>
        <table>
          <tbody>
            <tr><td>Pension growth</td><td>{pensionGrowth}%/yr</td></tr>
            <tr><td>ISA growth</td><td>{isaGrowth}%/yr</td></tr>
            <tr><td>SIPP growth</td><td>{sippGrowth}%/yr</td></tr>
            <tr><td>Inflation</td><td>{inflation}%/yr{adjustForInflation ? " (figures above are inflation-adjusted, in today's money)" : " (not applied — figures above are nominal)"}</td></tr>
            <tr><td>{a1.name || "Adult 1"}'s state pension age</td><td>{a1.statePensionAge ?? 67}</td></tr>
            <tr><td>{a2.name || "Adult 2"}'s state pension age</td><td>{a2.statePensionAge ?? 67}</td></tr>
            <tr><td>{a2.name || "Adult 2"}'s target retirement age</td><td>{a2TargetRetireAge}</td></tr>
          </tbody>
        </table>

        <div className="fp-print-foot">
          This is a personal planning tool, not financial advice. Figures are projections based on constant
          contribution and growth-rate assumptions entered above — actual returns, inflation, and life events
          will differ. Consult a qualified financial adviser before making retirement decisions.
        </div>
      </div>
    </div>
  );
}
