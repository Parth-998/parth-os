"use client";
import { useEffect, useRef, useState } from "react";

/**
 * sudo rm -rf / : the terminal floods with deleted files, programs die and their windows vanish, the
 * screen goes black, the kernel panics, and you're dropped into the initramfs rescue shell.
 * Type `reboot` to bring it back.
 */
type Stage = "dying" | "black" | "panic" | "shell";

const ts = (up: number, i: number) => (up + (i < 2 ? i * 0.41 : 0.83 + (i - 2) * 0.000137)).toFixed(6).padStart(12, " ");
const PANIC = (up: number) => [
  `[${ts(up, 0)}] rm[1337]: removing '/usr/lib/systemd' ...`,
  `[${ts(up, 1)}] systemd[1]: Caught <SEGV>, core dump failed.`,
  `[${ts(up, 2)}] Kernel panic - not syncing: Attempted to kill init! exitcode=0x00007f00`,
  `[${ts(up, 3)}] CPU: 3 PID: 1 Comm: init Not tainted 6.11-parth #1`,
  `[${ts(up, 4)}] Hardware name: parth-os desktop`,
  `[${ts(up, 5)}] Call Trace:`,
  `[${ts(up, 6)}]  <TASK>`,
  `[${ts(up, 7)}]  dump_stack_lvl+0x48/0x70`,
  `[${ts(up, 8)}]  panic+0x34e/0x370`,
  `[${ts(up, 9)}]  do_exit.cold+0x15/0x15`,
  `[${ts(up, 10)}]  do_group_exit+0x2d/0x90`,
  `[${ts(up, 11)}]  __x64_sys_exit_group+0x14/0x20`,
  `[${ts(up, 12)}]  do_syscall_64+0x5d/0x170`,
  `[${ts(up, 13)}]  entry_SYSCALL_64_after_hwframe+0x76/0x7e`,
  `[${ts(up, 14)}]  </TASK>`,
  `[${ts(up, 15)}] Kernel Offset: 0x2c000000 from 0xffffffff81000000`,
  `[${ts(up, 16)}] ---[ end Kernel panic - not syncing: Attempted to kill init! exitcode=0x00007f00 ]---`,
];

export default function Meltdown({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("dying");
  const [panicLines, setPanicLines] = useState(0);
  const [shell, setShell] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const up = useRef((performance.now() / 1000) % 9000);

  // what a real machine does: nothing dramatic. programs die one by one as their files disappear
  // (windows just vanish), the display server goes, the screen is black, and the kernel panics.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("md-dying");
    const els = [...document.querySelectorAll<HTMLElement>(".win, .bar, .home-name, .toast")];
    const ts: number[] = [];
    els.forEach((el) => {
      ts.push(window.setTimeout(() => el.classList.add("md-gone"), 150 + Math.random() * 1300));
    });
    ts.push(
      window.setTimeout(() => {
        html.classList.add("md-dead"); // the compositor is gone: black
        setStage("black");
      }, 1700),
    );
    ts.push(window.setTimeout(() => setStage("panic"), 2600));
    return () => {
      ts.forEach(clearTimeout);
      html.classList.remove("md-dying", "md-dead");
      els.forEach((el) => el.classList.remove("md-gone"));
    };
  }, []);

  // panic text prints line by line, then the rescue shell
  useEffect(() => {
    if (stage !== "panic") return;
    const all = PANIC(up.current);
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setPanicLines(i);
      if (i >= all.length) {
        clearInterval(id);
        window.setTimeout(() => setStage("shell"), 1400);
      }
    }, 70);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === "shell") window.setTimeout(() => input.current?.focus(), 50);
  }, [stage]);

  const run = (raw: string) => {
    const cmd = raw.trim();
    const echo = `(initramfs) ${cmd}`;
    if (/^(sudo\s+)?(reboot|exit|shutdown\s+-r\s+now|systemctl\s+reboot)(\s+-f)?$/.test(cmd)) {
      setShell((s) => [...s, echo, "[  OK  ] Reached target Reboot.", "rebooting..."]);
      window.setTimeout(onDone, 900);
      return;
    }
    const reply = !cmd
      ? null
      : cmd === "help"
        ? "Built-in commands: reboot exit help ls  (hint: reboot)"
        : cmd === "ls" || cmd.startsWith("ls ")
          ? "(nothing. you deleted it all.)"
          : cmd.startsWith("sudo")
            ? "sudo: not found. you deleted that too."
            : `sh: ${cmd.split(/\s+/)[0]}: not found`;
    setShell((s) => [...s, echo, ...(reply ? [reply] : [])].slice(-14));
  };

  return (
    <>
      {stage === "black" && <div className="md-panic" aria-hidden />}
      {(stage === "panic" || stage === "shell") && (
        <div className="md-panic mono" role="alert" onClick={() => input.current?.focus()}>
          {PANIC(up.current)
            .slice(0, panicLines)
            .map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          {stage === "shell" && (
            <div className="mt-5">
              <div>BusyBox v1.36.1 (parth-os) built-in shell (ash)</div>
              <div>Enter &apos;help&apos; for a list of built-in commands.</div>
              <div className="mt-3" />
              {shell.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              <form
                className="flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(value);
                  setValue("");
                }}
              >
                <span>(initramfs)&nbsp;</span>
                <input
                  ref={input}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="flex-1 bg-transparent outline-none"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  aria-label="rescue shell"
                />
              </form>
              <div className="md-hint">type reboot to bring it back</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
