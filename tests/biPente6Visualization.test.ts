import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { availableBiChartModes, biParetoRows } from "../src/components/bi/biChartModePolicy.ts";
const data=[{id:"A",label:"A",value:40},{id:"B",label:"B",value:35},{id:"C",label:"C",value:25}];
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
test("PENTE6: percentual independente não é composição de rosca",()=>{
  assert.deepEqual(availableBiChartModes(data,"percent","temporal"),["bars","line","area"]);
  assert.deepEqual(availableBiChartModes(data,"percent","categorical"),["bars"]);
});
test("PENTE6: contagens aditivas com poucas categorias permitem Pareto e rosca",()=>{
  assert.deepEqual(availableBiChartModes(data,"minutes","categorical"),["bars","pareto","donut","pie"]);
  assert.deepEqual(availableBiChartModes([...data,{id:"N",label:"N",value:null}],"count","categorical"),["bars"]);
  assert.deepEqual(availableBiChartModes([{id:"A",label:"A",value:-1},data[1]],"count","categorical"),["bars"]);
  assert.deepEqual(availableBiChartModes(Array.from({length:8},(_,i)=>({id:String(i),label:String(i),value:2})),"count","categorical"),["bars","pareto"]);
});
test("PENTE6: Pareto ordenado, acumulado 100%, sem alterar valores",()=>{
  const out=biParetoRows([data[2],data[0],data[1]]);
  assert.deepEqual(out.map(x=>x.id),["A","B","C"]);
  assert.deepEqual(out.map(x=>x.cumulativePercent),[40,75,100]);
  assert.equal(out.reduce((t,x)=>t+(x.value??0),0),100);
});
test("PENTE6: modos não criam novos pedidos à API e mantêm CSV e drilldown",()=>{
  const chart=read("../src/components/bi/BiChartExplorer.tsx");
  const render=read("../src/components/bi/BiChartAlternative.tsx");
  const coverage=read("../src/components/bi/BiProductionCoverageDialog.tsx");
  for(const s of ["availableBiChartModes","BiChartAlternative","csvCell","onInspectRow(selected)","URL.revokeObjectURL"])assert.ok(chart.includes(s),s);
  for(const s of ["<PieChart>","<AreaChart","<LineChart","<ComposedChart","ReferenceLine"])assert.ok(render.includes(s),s);
  assert.match(coverage,/machineCoverage/);
  assert.doesNotMatch(chart,/fetch\(|axios\(|loadAnalyticsDrilldown\(/);
});
