-- AlterTable
ALTER TABLE "andon_calls" ADD COLUMN     "machineSubsetCodeSnapshot" TEXT,
ADD COLUMN     "machineSubsetId" TEXT,
ADD COLUMN     "machineSubsetNameSnapshot" TEXT,
ADD COLUMN     "machineSubsetTypeSnapshot" TEXT;

-- AlterTable
ALTER TABLE "machine_sets" ADD COLUMN     "typeId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "machine_set_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_set_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_subset_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_subset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_subsets" (
    "id" TEXT NOT NULL,
    "machineSetId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "assetTag" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_subsets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_set_types_code_key" ON "machine_set_types"("code");

-- CreateIndex
CREATE INDEX "machine_set_types_isActive_idx" ON "machine_set_types"("isActive");

-- CreateIndex
CREATE INDEX "machine_set_types_displayOrder_idx" ON "machine_set_types"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "machine_subset_types_code_key" ON "machine_subset_types"("code");

-- CreateIndex
CREATE INDEX "machine_subset_types_isActive_idx" ON "machine_subset_types"("isActive");

-- CreateIndex
CREATE INDEX "machine_subset_types_displayOrder_idx" ON "machine_subset_types"("displayOrder");

-- CreateIndex
CREATE INDEX "machine_subsets_machineSetId_idx" ON "machine_subsets"("machineSetId");

-- CreateIndex
CREATE INDEX "machine_subsets_typeId_idx" ON "machine_subsets"("typeId");

-- CreateIndex
CREATE INDEX "machine_subsets_assetTag_idx" ON "machine_subsets"("assetTag");

-- CreateIndex
CREATE INDEX "machine_subsets_isActive_idx" ON "machine_subsets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "machine_subsets_machineSetId_code_key" ON "machine_subsets"("machineSetId", "code");

-- CreateIndex
CREATE INDEX "andon_calls_machineSubsetId_idx" ON "andon_calls"("machineSubsetId");

-- CreateIndex
CREATE INDEX "machine_sets_typeId_idx" ON "machine_sets"("typeId");

-- AddForeignKey
ALTER TABLE "machine_sets" ADD CONSTRAINT "machine_sets_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "machine_set_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_subsets" ADD CONSTRAINT "machine_subsets_machineSetId_fkey" FOREIGN KEY ("machineSetId") REFERENCES "machine_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_subsets" ADD CONSTRAINT "machine_subsets_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "machine_subset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "andon_calls" ADD CONSTRAINT "andon_calls_machineSubsetId_fkey" FOREIGN KEY ("machineSubsetId") REFERENCES "machine_subsets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ANDON_INITIAL_MACHINE_CATALOGS
-- Catálogo inicial de tipos de conjuntos.
INSERT INTO "machine_set_types"
(
    "id",
    "code",
    "name",
    "description",
    "isActive",
    "displayOrder",
    "createdAt",
    "updatedAt"
)
VALUES
    ('mst_maker', 'maker', 'Maker', 'Conjunto responsável pela formação ou fabricação principal.', TRUE, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_bagger', 'bagger', 'Bagger', 'Conjunto responsável pelo ensacamento ou embalagem.', TRUE, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_filtro', 'filtro', 'Filtro', 'Conjunto de filtragem do processo ou equipamento.', TRUE, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_esteira', 'esteira', 'Esteira', 'Conjunto de transporte por esteira.', TRUE, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_dosador', 'dosador', 'Dosador', 'Conjunto responsável pela dosagem de produto.', TRUE, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_selagem', 'selagem', 'Selagem', 'Conjunto responsável pelo processo de selagem.', TRUE, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mst_corte', 'corte', 'Corte', 'Conjunto responsável pelo processo de corte.', TRUE, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Catálogo inicial de tipos de subconjuntos e equipamentos.
INSERT INTO "machine_subset_types"
(
    "id",
    "code",
    "name",
    "description",
    "isActive",
    "displayOrder",
    "createdAt",
    "updatedAt"
)
VALUES
    ('msst_motor', 'motor', 'Motor', NULL, TRUE, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_motorredutor', 'motorredutor', 'Motorredutor', NULL, TRUE, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_servo_motor', 'servo_motor', 'Servo motor', NULL, TRUE, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_redutor', 'redutor', 'Redutor', NULL, TRUE, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_rolamento', 'rolamento', 'Rolamento', NULL, TRUE, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_eixo', 'eixo', 'Eixo', NULL, TRUE, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_rolo', 'rolo', 'Rolo', NULL, TRUE, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_correia', 'correia', 'Correia', NULL, TRUE, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_corrente', 'corrente', 'Corrente', NULL, TRUE, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_engrenagem', 'engrenagem', 'Engrenagem', NULL, TRUE, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_roda_formadora', 'roda_formadora', 'Roda formadora', NULL, TRUE, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_colar_formador', 'colar_formador', 'Colar formador', NULL, TRUE, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_mordente_selagem', 'mordente_selagem', 'Mordente de selagem', NULL, TRUE, 130, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_faca_corte', 'faca_corte', 'Faca de corte', NULL, TRUE, 140, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_rosca_dosadora', 'rosca_dosadora', 'Rosca dosadora', NULL, TRUE, 150, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_elemento_filtrante', 'elemento_filtrante', 'Elemento filtrante', NULL, TRUE, 160, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_sensor', 'sensor', 'Sensor', NULL, TRUE, 170, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_encoder', 'encoder', 'Encoder', NULL, TRUE, 180, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_celula_carga', 'celula_carga', 'Célula de carga', NULL, TRUE, 190, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_cilindro_pneumatico', 'cilindro_pneumatico', 'Cilindro pneumático', NULL, TRUE, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_valvula_solenoide', 'valvula_solenoide', 'Válvula solenoide', NULL, TRUE, 210, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_inversor_frequencia', 'inversor_frequencia', 'Inversor de frequência', NULL, TRUE, 220, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_plc', 'plc', 'PLC', NULL, TRUE, 230, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_ihm', 'ihm', 'IHM', NULL, TRUE, 240, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_resistencia_aquecimento', 'resistencia_aquecimento', 'Resistência de aquecimento', NULL, TRUE, 250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_termopar', 'termopar', 'Termopar', NULL, TRUE, 260, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_bomba', 'bomba', 'Bomba', NULL, TRUE, 270, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_ventilador', 'ventilador', 'Ventilador', NULL, TRUE, 280, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('msst_outro', 'outro', 'Outro', NULL, TRUE, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
