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
success append their second component array. Tropical success appends witness
indexes. Recenter success reports the normalized array and removed maximum.
Failures are `1`, `error`, and the modeled error code.

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
vectors and exercised independently by the runtime oracle.
