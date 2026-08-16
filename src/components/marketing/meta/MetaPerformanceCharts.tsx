import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, BarChart3 } from "lucide-react";
import { useState } from "react";

export function MetaPerformanceCharts() {
  const [period, setPeriod] = useState("30");

  return (
    <div className="space-y-4">
      <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/20" style={{ backdropFilter: 'blur(16px)' }}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white">Performance</CardTitle>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-7 w-[120px] text-[11px] bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="14">Last 14 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Clicks chart placeholder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-2xl font-bold text-white">–</p>
                <p className="text-[11px] text-white/60">Clicks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">–</p>
                <p className="text-[11px] text-white/60">Conversions</p>
              </div>
            </div>
            <div className="h-32 flex items-center justify-center rounded-lg bg-white/5 border border-white/10">
              <div className="text-center">
                <BarChart3 className="h-8 w-8 text-white/20 mx-auto mb-1" />
                <p className="text-[11px] text-white/40">Ingen kampagnedata endnu</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-white/60">Clicks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-white/60">Conversions</span>
              </div>
            </div>
          </div>

          {/* Second chart placeholder */}
          <div>
            <div className="h-28 flex items-center justify-center rounded-lg bg-white/5 border border-white/10">
              <div className="text-center">
                <TrendingUp className="h-6 w-6 text-white/20 mx-auto mb-1" />
                <p className="text-[11px] text-white/40">Spend & ROAS trend</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-white/60">Clicks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-white/60">Conversions</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
