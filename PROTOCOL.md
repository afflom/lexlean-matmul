# Matrix request protocol, version 1

Requests contain ASCII tab-separated fields. Scalar arrays contain
comma-separated canonical signed decimal integers; the empty field denotes an
empty array. There is no trailing newline. Dimensions are canonical decimal
integers from zero through eight, and each magnitude has at most 64 digits.
The request, response, and guest-allocation bounds are declared by the
application model. Source declarations remain authoritative.

| Operation | Fields after `1` and operation name |
| --- | --- |
| `matmul` | `m`, `k`, `n`, `A`, `B` |
| `gemm` | `alpha`, `beta`, `m`, `k`, `n`, `A`, `B`, `C` |
| `coded` | `tier`, `m`, `k`, `n`, `A`, `B-codes` |
| `table` | `codebook`, `m`, `k`, `n`, `A`, `B-codes` |
| `partitioned` | `block`, `m`, `k`, `n`, `A`, `B` |
| `complex` | `m`, `k`, `n`, `A-real`, `A-imag`, `B-real`, `B-imag` |
| `dyadic` | `m`, `k`, `n`, `A-coefficients`, `A-scales`, `B-coefficients`, `B-scales` |
| `tropical` | `m`, `k`, `n`, `A`, `B` |
| `recenter` | `values` |
| `ieee` | `format`, `mode`, `m`, `k`, `n`, `A-bits`, `B-bits` |
| `ieee-gemm` | `format`, `mode`, `alpha`, `beta`, `m`, `k`, `n`, `A-bits`, `B-bits`, `C-bits` |
| `ieee-table` | `format`, `mode`, `codebook-bits`, `m`, `k`, `n`, `A-bits`, `B-codes` |
| `encode` | `width`, `mode`, `m`, `k`, `n`, `A`, `B` |
| `encode-dyadic` | `width`, `mode`, `m`, `k`, `n`, `A-coefficients`, `A-scales`, `B-coefficients`, `B-scales` |
| `bias` | `m`, `k`, `n`, `bias`, `A`, `B` |
| `bias-gemm` | `alpha`, `beta`, `m`, `k`, `n`, `bias`, `A`, `B`, `C` |
| `complex-gemm` | `alpha`, `beta`, `m`, `k`, `n`, `A-real`, `A-imag`, `B-real`, `B-imag`, `C-real`, `C-imag` |
| `complex-bias` | `m`, `k`, `n`, `bias`, `A-real`, `A-imag`, `B-real`, `B-imag` |
| `complex-bias-gemm` | `alpha`, `beta`, `m`, `k`, `n`, `bias`, `A-real`, `A-imag`, `B-real`, `B-imag`, `C-real`, `C-imag` |
| `tropical-gemm` | `alpha`, `beta`, `m`, `k`, `n`, `A`, `B`, `C` |
| `complex-encode` | `width`, `mode`, `alpha`, `beta`, `m`, `k`, `n`, `A-real`, `A-imag`, `B-real`, `B-imag`, `C-real`, `C-imag` |
| `tropical-encode` | `width`, `mode`, `alpha`, `beta`, `m`, `k`, `n`, `A`, `B`, `C` |

Matrices are row major: `A` has `m*k` entries, `B` has `k*n`, and `C` has
`m*n`. Binary codes `0,1` decode to `-1,+1`; ternary codes `0,1,2` decode to
`-1,0,+1`; signed-eight-bit codes are bytes `0..255` with two's-complement
interpretation. Table codes index the caller's codebook.

A dyadic value is `coefficient / 2^scale`, with input scales from zero through
64. The exact result reports coefficients and scales; it need not reduce a
coefficient/scale pair to lowest terms. Tropical arrays admit `-inf` alongside
finite integers. Equal maxima select the smallest index; an empty reduction
reports `none` as its witness.

Ordinary success is `1`, `ok`, `rows`, `columns`, `cells`. Complex and dyadic
success append their second component array. The `tropical` operation appends
witness indexes; `tropical-gemm` and `tropical-encode` return cells only. Recenter success reports the normalized array and removed maximum.
Failures are `1`, `error`, and the modeled error code. The generated
[error register](ERRORS.md) lists every variant and its negative vector coverage.

IEEE `format` is `f32` or `f64`. Inputs and outputs are unsigned decimal bit
patterns, not decimal floating-point text. All products and sums are exact
before one output encoding. NaNs become the canonical quiet NaN; opposite
infinities and zero times infinity produce NaN. Exact cancellation returns
positive zero, and underflow of a negative nonzero result preserves negative
zero. IEEE GEMM uses signed integer `alpha` and `beta`, as in the UOR reference.
Unused NaN entries in a codebook do not affect a table product.

`mode` is `nearest`, `toward-zero`, `saturating`, or `wrapping`. IEEE `nearest`
uses ties to even and overflows to infinity. The other IEEE modes truncate
and clamp to the largest finite magnitude. Signed integer output widths are
1 through 64 bits: `wrapping` uses modular two's-complement encoding, while
the other modes clamp to the signed interval. Dyadic `nearest` rounds ties
to even before clamping; the remaining non-wrapping modes truncate toward
zero before clamping. Complex encoding applies the selected integer codec
to each component independently.

Bias has one integer per output column and is added after the GEMM linear
epilogue. Complex bias changes the real component. Tropical GEMM uses max
for addition and finite integer addition for multiplication; `-inf` is its
additive identity. Tropical finite encodings reserve the signed interval's
endpoints and therefore require widths 2 through 64. Their wrapping mode
matches the reference's unsigned 128-bit offset reduction, including negative
offsets. Input arrays must match their declared shapes even when beta makes
the previous output irrelevant.

The following code blocks contain literal tabs and can be pasted into the
generated browser request field.

```text
1	matmul	2	2	2	1,2,3,4	5,6,7,8
```

Expected response:

```text
1	ok	2	2	19,22,43,50
```

A coded ternary product:

```text
1	coded	ternary	1	3	1	10,20,30	0,1,2
```

Expected response:

```text
1	ok	1	1	20
```

An exact result larger than a signed 64-bit accumulator:

```text
1	matmul	1	1	1	9223372036854775807	9223372036854775807
```

Expected response:

```text
1	ok	1	1	85070591730234615847396907784232501249
```

For zero-depth multiplication, both operand fields are empty, so preserve both
trailing tabs when copying a request. Negative fixtures, every error variant,
and exact byte-boundary requests are registered as application acceptance
vectors. Independent runtime oracles cover all operation families; the complete
`just vv` result determines release qualification.

A binary64 product of 1 and 2, expressed as IEEE bit patterns:

```text
1	ieee	f64	nearest	1	1	1	4607182418800017408	4611686018427387904
```

Expected response:

```text
1	ok	1	1	4611686018427387904
```

An eight-bit wrapping output codec applied after the exact product 200 × 2:

```text
1	encode	8	wrapping	1	1	1	200	2
```

Expected response:

```text
1	ok	1	1	-112
```
