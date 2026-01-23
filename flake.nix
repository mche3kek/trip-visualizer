{
  description = "Dev environment for japan-travel-visualizer (Vite + React + TS)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22; # good match for your deps
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            node
            nodePackages.pnpm
          ];

          shellHook = ''
        # Switch to *system* fish so you get your normal config
        if [ -z "$FISH_VERSION" ]; then
          if [ -x /run/current-system/sw/bin/fish ]; then
            exec /run/current-system/sw/bin/fish -C 'source .venv/bin/activate.fish'
          elif command -v fish >/dev/null 2>&1; then
            exec fish
          else
            echo "fish not found on system PATH."
          fi
        fi
            echo "✅ japan-travel-visualizer dev shell"
            echo "Node:  $(node --version)"
            echo "pnpm:  $(pnpm --version)"
            echo ""
            echo "Run:"
            echo "  pnpm install"
            echo "  pnpm dev"
          '';
        };
      });
}
