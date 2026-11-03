# Deployment profiles

**Status:** partial application override examples; not complete deployments. Load through CONFIG_FILE with NODE_ENV=production, after adapting hostnames and paths. No keys or accounts are included.

| Example | Identity/data | Network |
|---|---|---|
| isolated-lab.example.json | security-lab; data/security-lab/ | Host-only nginx TLS → loopback Node |
| invited-demo.example.json | invited-demo; data/invited-demo/ | Cloudflare Access/Tunnel → nginx → loopback Node |

Both use purpose=lab to avoid claiming a live service; labels distinguish them. This metadata does not enable Scenario Builder or enforce network isolation. Fixture/debug/inspection remain off. Use normal disposable accounts with valid saved decks. Provision separately; never reuse a database under a different bound identity.

These examples set only supported application overrides. They do not configure Node's missing explicit listen host, nginx, cloudflared, Access, metrics, TLS, firewall, systemd or secrets. Complete those prerequisites before exposure. The loopback proxy must overwrite forwarding identity headers; verify actual attribution before relying on IP limits. Initially keep admin local/off the public navigation.

See [runbooks](../../lab/runbooks/README.md) and [architecture decisions](../../docs/security-lab-architecture.md).

## Implemented application lab profile

[scenario-lab.example.json](scenario-lab.example.json) is the Milestone 7 built local profile used by `npm run start:lab` on loopback port 3001. Unlike the two security-infrastructure drafts above, it deliberately enables scenario capability plus inspection and a local admin route. It still needs an external operator password/account and a prior application build. It does not configure host/network isolation or expose the security assessment VM. See [setup](../../docs/scenario-lab-architecture.md).
