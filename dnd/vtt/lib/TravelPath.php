<?php
declare(strict_types=1);

/**
 * The height a creature is at along one straight move. Paired with travel-height.mjs.
 *
 * While a mover has footing it is at the height of that footing: the ground, a plate, a ramp.
 * When the footing drops away under it faster than a slope could (it has gone over a plate's edge,
 * off the side of a ramp, off a cliff) it has left its footing, and from there it travels on level,
 * at the height it left from. It falls when the move ends, not during it. So a wall or a creature
 * on the ground far below is not in its way; only what reaches its own height is. It has footing
 * again only where the ground comes back up to it.
 *
 * A pushed creature leaves its footing at any drop steeper than a slope. A walker steps down
 * anything less than a fall and only leaves its footing at a real one.
 *
 * Before this, a mover was measured at the height of the ground under it at every point. A push
 * off an island 18 squares up was "at ground level" the moment it cleared the edge, and a crystal
 * on the crater floor under its path stopped it.
 *
 * One object answers for one mover from one place. It remembers the path it has walked, so asking
 * about many points along the same line (as a push that is looking for where it stops does) reads
 * each stretch of ground once.
 */
final class TravelPath
{
    /** Slack for nearly flush plates and uneven ground when deciding a mover has left its footing. */
    public const SLACK = .05;
    /** A walker leaves its footing only by a drop this deep; anything less is a step down. */
    public const FALL_DROP = 1.5;
    /** The path is read this often, in squares. */
    public const STEP = .125;

    private float $start;
    private bool $flying;
    /** @var array{0:float,1:float}|null the direction the remembered path runs in */
    private ?array $ray = null;
    /** @var list<array{0:float,1:bool,2:bool}> height, in the air, hit higher ground: one per STEP */
    private array $walked = [];

    public function __construct(private array $from, private array $config, private string $kind = 'forced', ?float $start = null)
    {
        $this->flying = FloorGeometry::isAirborne($from);
        $this->start = $start ?? WallMovement::height($from, $config);
    }

    /**
     * What a step of `$run` squares does to a mover at height `$z`, when the footing at the end of
     * it is at `$here`. Returns [height, in the air].
     */
    public static function step(float $z, bool $air, float $here, float $run, string $kind = 'forced'): array
    {
        if ($air) return $here >= $z - self::SLACK ? [$here, false] : [$z, true];
        $allow = FloorGeometry::CLIMB_GRADE * $run + self::SLACK;
        if ($kind !== 'forced') $allow = max($allow, self::FALL_DROP - 1e-6);
        return $z - $here > $allow ? [$z, true] : [$here, false];
    }

    /**
     * The height the mover is at when it has got as far as `$at`.
     * `$plain` reads the footing at `$at` without looking for a plate to step onto on the way there.
     * A flier is wherever its own flight puts it.
     */
    public function heightAt(array $at, bool $plain = false): float
    {
        $at = $this->placed($at);
        $here = $plain ? WallMovement::height($at, $this->config) : WallMovement::movementHeight($this->from, $at, $this->config);
        if ($this->flying) return $here;
        $run = $this->aim($at);
        if ($run < 1e-9) return $here;
        $k = $this->before($run);
        [$z, $air] = $this->walk($k);
        return self::step($z, $air, $here, $run - $k * self::STEP, $this->kind)[0];
    }

    /**
     * True when the mover, having left its footing, meets ground standing higher than itself on
     * the way to `$to`: pushed off a low island straight at a cliff, it hits the cliff. Ground that
     * only rises part of the way up to it (a boulder under an island) is passed over.
     */
    public function slams(array $to): bool
    {
        if ($this->flying) return false;
        $to = $this->placed($to);
        $run = $this->aim($to);
        if ($run < 1e-9) return false;
        $k = $this->before($run);
        [$z, $air] = $this->walk($k);
        for ($i = 1; $i <= $k; $i++) if ($this->walked[$i][2]) return true;
        return $air && WallMovement::height($to, $this->config) >= $z + TerrainContact::FACE_RISE - 1e-6;
    }

    private function placed(array $at): array
    {
        return [...$this->from, 'column' => $at['column'], 'row' => $at['row']];
    }

    /** Points the remembered path at `$at` and returns how far away it is. */
    private function aim(array $at): float
    {
        $dx = $at['column'] - $this->from['column']; $dy = $at['row'] - $this->from['row']; $run = max(abs($dx), abs($dy));
        if ($run < 1e-9) return 0.;
        $ray = [$dx / $run, $dy / $run];
        if ($this->ray === null || abs($ray[0] - $this->ray[0]) > 1e-7 || abs($ray[1] - $this->ray[1]) > 1e-7) {
            $this->ray = $ray; $this->walked = [[$this->start, false, false]];
        }
        return $run;
    }

    /** The last remembered point that lies short of `$run`. */
    private function before(float $run): int
    {
        $k = (int) floor($run / self::STEP + 1e-9);
        return $run - $k * self::STEP < 1e-9 ? $k - 1 : $k;
    }

    private function walk(int $k): array
    {
        for ($i = count($this->walked); $i <= $k; $i++) {
            $s = $i * self::STEP; [$z, $air] = $this->walked[$i - 1];
            $here = WallMovement::height([...$this->from, 'column' => $this->from['column'] + $this->ray[0] * $s, 'row' => $this->from['row'] + $this->ray[1] * $s], $this->config);
            $this->walked[$i] = [...self::step($z, $air, $here, self::STEP, $this->kind), $air && $here >= $z + TerrainContact::FACE_RISE - 1e-6];
        }
        return $this->walked[$k];
    }
}
