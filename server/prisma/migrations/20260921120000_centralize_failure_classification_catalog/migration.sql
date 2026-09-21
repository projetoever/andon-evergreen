-- Consolida, sem sobrescrever registros existentes, todos os identificadores
-- reconhecidos historicamente pelo frontend, backend e seeds do ANDON.
INSERT INTO "failure_classifications" (
    "id",
    "label",
    "value",
    "active",
    "createdAt",
    "updatedAt"
)
VALUES
    ('failure_catalog_real_machine_failure', 'Falha real da máquina', 'real_machine_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_electrical_failure', 'Falha elétrica', 'electrical_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_mechanical_failure', 'Falha mecânica', 'mechanical_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_automation_sensor_failure', 'Falha de automação / sensor', 'automation_sensor_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_operational_failure', 'Falha operacional', 'operational_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_process_failure', 'Falha de processo', 'process_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_operational_process_failure', 'Falha operacional', 'operational_process_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_quality_failure', 'Falha de qualidade', 'quality_failure', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_manual_intervention', 'Intervenção manual', 'manual_intervention', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_simulation_test', 'Simulação / teste', 'simulation_test', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_unidentified_stop', 'Parada sem causa identificada', 'unidentified_stop', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_other', 'Outro', 'other', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_manual_simulation', 'Simulação manual', 'manual_simulation', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_adjustment', 'Ajuste', 'adjustment', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_test', 'Teste', 'test', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('failure_catalog_unclassified', 'Não classificada', 'unclassified', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
