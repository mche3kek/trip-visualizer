import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { DayPlan } from '../types';
import { Wallet, TrendingUp, Calendar, Ticket } from 'lucide-react';

interface StatsViewProps {
  days: DayPlan[];
}

export const StatsView: React.FC<StatsViewProps> = ({ days }) => {
  // Aggregate activity data
  const typeCount: Record<string, number> = {};
  let totalActivities = 0;
  let freeActivities = 0;

  // Expense tracking
  let totalExpenses = 0;
  const expenseByType: Record<string, number> = {};
  const dailyExpenses: { name: string; city: string; expenses: number; transit: number }[] = [];

  days.forEach(day => {
    let dayExpense = 0;
    let dayTransit = 0;

    day.activities.forEach(act => {
      typeCount[act.type] = (typeCount[act.type] || 0) + 1;
      totalActivities++;

      const price = act.pricing?.basePrice || 0;
      if (act.pricing?.isFree || price === 0) {
        freeActivities++;
      }

      dayExpense += price;
      totalExpenses += price;
      expenseByType[act.type] = (expenseByType[act.type] || 0) + price;
    });

    // Add transit costs
    (day.travelSegments || []).forEach(seg => {
      const fare = seg.transitFare || 0;
      dayTransit += fare;
      totalExpenses += fare;
    });

    dailyExpenses.push({
      name: day.date.substring(5), // MM-DD
      city: day.city,
      expenses: dayExpense,
      transit: dayTransit
    });
  });

  const pieData = Object.keys(typeCount).map(type => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: typeCount[type]
  }));

  const expensePieData = Object.keys(expenseByType)
    .filter(type => expenseByType[type] > 0)
    .map(type => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: expenseByType[type]
    }));

  const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa'];
  const EXPENSE_COLORS = ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'];

  // Calculate stats
  const averagePerDay = days.length > 0 ? Math.round(totalExpenses / days.length) : 0;
  const mostExpensiveDay = dailyExpenses.reduce((max, day) =>
    (day.expenses + day.transit) > (max.expenses + max.transit) ? day : max,
    { name: '', city: '', expenses: 0, transit: 0 }
  );

  return (
    <div className="p-6 space-y-8 bg-white rounded-xl shadow h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-800">Trip Statistics</h2>

      {/* Budget Overview Card */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-xl border border-green-200">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-6 h-6 text-green-600" />
          <h3 className="font-bold text-green-900 text-lg">Budget Overview</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/60 p-4 rounded-lg">
            <p className="text-xs text-green-600 uppercase tracking-wide">Total Estimated</p>
            <p className="text-2xl font-bold text-green-900">¥{totalExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white/60 p-4 rounded-lg">
            <p className="text-xs text-green-600 uppercase tracking-wide">Per Day Average</p>
            <p className="text-2xl font-bold text-green-900">¥{averagePerDay.toLocaleString()}</p>
          </div>
          <div className="bg-white/60 p-4 rounded-lg">
            <p className="text-xs text-green-600 uppercase tracking-wide">Most Expensive Day</p>
            <p className="text-lg font-bold text-green-900">{mostExpensiveDay.city || '-'}</p>
            <p className="text-xs text-green-600">¥{(mostExpensiveDay.expenses + mostExpensiveDay.transit).toLocaleString()}</p>
          </div>
          <div className="bg-white/60 p-4 rounded-lg">
            <p className="text-xs text-green-600 uppercase tracking-wide">Free Activities</p>
            <p className="text-2xl font-bold text-green-900">{freeActivities}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Activity Types Pie Chart */}
        <div className="h-64 border rounded-xl p-4 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Activity Types</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Expense by Category Pie Chart */}
        <div className="h-64 border rounded-xl p-4 bg-green-50">
          <h3 className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-1">
            <Wallet className="w-4 h-4" /> Expenses by Category
          </h3>
          {expensePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expensePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No expense data yet. Add prices to activities!
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Activities per Day */}
        <div className="h-64 border rounded-xl p-4 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <Calendar className="w-4 h-4" /> Activities per Day
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyExpenses}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const day = days.find(d => d.date.substring(5) === label);
                    return (
                      <div className="bg-white p-2 border shadow text-xs">
                        <p className="font-bold">{label}</p>
                        <p>{payload[0].payload.city}</p>
                        <p>Activities: {day?.activities.length || 0}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey={(d) => days.find(day => day.date.substring(5) === d.name)?.activities.length || 0}
                fill="#818cf8"
                radius={[4, 4, 0, 0]}
                name="Activities"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Expenses Bar Chart */}
        <div className="h-64 border rounded-xl p-4 bg-green-50">
          <h3 className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Daily Expenses
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyExpenses}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number, name: string) => [`¥${value.toLocaleString()}`, name]}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white p-2 border shadow text-xs">
                        <p className="font-bold">{label} - {payload[0].payload.city}</p>
                        <p className="text-green-600">Attractions: ¥{payload[0].payload.expenses.toLocaleString()}</p>
                        <p className="text-blue-600">Transit: ¥{payload[0].payload.transit.toLocaleString()}</p>
                        <p className="font-bold mt-1">Total: ¥{(payload[0].payload.expenses + payload[0].payload.transit).toLocaleString()}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="expenses" stackId="a" fill="#10b981" name="Attractions" radius={[0, 0, 0, 0]} />
              <Bar dataKey="transit" stackId="a" fill="#60a5fa" name="Transit" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-indigo-50 p-4 rounded-xl">
        <h3 className="font-bold text-indigo-900 mb-2">Summary</h3>
        <p className="text-indigo-700">
          You have planned <span className="font-bold">{totalActivities}</span> activities across <span className="font-bold">{days.length}</span> days.
          The busiest leg of your trip is currently <span className="font-bold">{days.reduce((a, b) => a.activities.length > b.activities.length ? a : b).city}</span>.
          {totalExpenses > 0 && (
            <> Your estimated total budget is <span className="font-bold text-green-700">¥{totalExpenses.toLocaleString()}</span>.</>
          )}
        </p>
      </div>
    </div>
  );
};
