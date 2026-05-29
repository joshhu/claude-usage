class ClaudeUsage < Formula
  desc "Token, cost, and session dashboard for Claude Code usage (Traditional Chinese UI)"
  homepage "https://github.com/joshhu/claude-usage"
  # Traditional Chinese fork of phuryn/claude-usage. URL and sha256 are pinned
  # to a main-branch commit of this fork so `brew install` ships the localized
  # (Traditional Chinese) dashboard. Bump both when main moves.
  url "https://github.com/joshhu/claude-usage/archive/2cbcfc23a794118e1759c37a94ed5af8a44c6c06.tar.gz"
  version "1.2.1-zh-tw"
  sha256 "7b7ef4d0295654cac2bc8cafea963d26ed154caa375a085756f680a0bcc6b230"
  license "MIT"
  head "https://github.com/joshhu/claude-usage.git", branch: "main"

  depends_on "python@3.13"

  def install
    libexec.install "cli.py", "scanner.py", "dashboard.py"

    (bin/"claude-usage").write <<~EOS
      #!/bin/bash
      exec "#{Formula["python@3.13"].opt_bin}/python3" "#{libexec}/cli.py" "$@"
    EOS
    chmod 0755, bin/"claude-usage"
  end

  test do
    # 1. No-args invocation prints the usage banner — exercises the shim.
    output = shell_output("#{bin}/claude-usage")
    assert_match "Claude Code Usage Dashboard", output
    assert_match "scan", output
    assert_match "dashboard", output

    # 2. `scan` against an empty projects dir exercises the real code path
    #    end-to-end (sqlite open, glob walk, summary print) without touching
    #    the user's real ~/.claude/usage.db. Homebrew's test sandbox provides
    #    testpath, so this stays isolated.
    (testpath/"projects").mkpath
    scan_output = shell_output("#{bin}/claude-usage scan --projects-dir #{testpath}/projects")
    assert_match "Scan complete", scan_output
  end
end
