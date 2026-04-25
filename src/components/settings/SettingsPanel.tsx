import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimulationPanel } from "./SimulationPanel";
import { SoundSettingsPanel } from "./SoundSettingsPanel";
import { DataBackupPanel } from "./DataBackupPanel";
import { AlertSettingsPanel } from "./AlertSettingsPanel";

export function SettingsPanel() {
  return (
    <Tabs defaultValue="simulation" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-muted p-2 lg:grid-cols-4">
        <TabsTrigger value="simulation" className="min-h-[56px] text-base font-bold uppercase">
          Simulação
        </TabsTrigger>
        <TabsTrigger value="sounds" className="min-h-[56px] text-base font-bold uppercase">
          Sons
        </TabsTrigger>
        <TabsTrigger value="backup" className="min-h-[56px] text-base font-bold uppercase">
          Backup
        </TabsTrigger>
        <TabsTrigger value="alerts" className="min-h-[56px] text-base font-bold uppercase">
          Alertas
        </TabsTrigger>
      </TabsList>
      <TabsContent value="simulation" className="mt-4">
        <SimulationPanel />
      </TabsContent>
      <TabsContent value="sounds" className="mt-4">
        <SoundSettingsPanel />
      </TabsContent>
      <TabsContent value="backup" className="mt-4">
        <DataBackupPanel />
      </TabsContent>
      <TabsContent value="alerts" className="mt-4">
        <AlertSettingsPanel />
      </TabsContent>
    </Tabs>
  );
}
