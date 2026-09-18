param(
    [int]$Cycles = 2,
    [int]$DelayMs = 1000
)

$ErrorActionPreference = "Stop"

# Diagnostic script for the Inovattio IT8786F GPIO runtime.
# This file is intentionally experimental until hardware validation is complete.
#
# Runtime strategy:
# - acquire the ISA mutex once;
# - open/load PawnIO once;
# - enter Super I/O once;
# - validate IT8786F, LDN 07 and base 0x0A00;
# - run ioctl_find_bars once;
# - restore LDN 07 and validate base again;
# - leave configuration mode;
# - keep the same PawnIO handle for repeated read-modify-write cycles;
# - force GPO1 LOW on exit when possible.
#
# The complete executable version used for bench validation is maintained
# alongside this branch during the hardware-learning phase.
#
# Hardware facts currently validated:
#   GPO1 -> GP41 -> port 0x0A03 -> mask 0x02
#   LOW  -> ~0 V
#   HIGH -> ~4.9 V
#
# Until this diagnostic passes across process restarts, do not promote the
# routine to the production agent.
#
# See README.md for the architecture and safety rules.

Write-Host "Use the validated bench copy of GPIO-Session-Stability-Test.ps1 for this phase."
Write-Host "Expected parameters: -Cycles 2 -DelayMs 1000"
