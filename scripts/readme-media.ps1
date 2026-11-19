# Optional documentation artwork generator. Uses only Windows/.NET assemblies;
# it adds no application dependency and makes no network requests.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$readmeRoot = Split-Path -Parent $PSScriptRoot
$readmeAssets = Join-Path $readmeRoot 'docs\assets\readme'
$readmePreview = Join-Path $readmeRoot '.cache'
$readmeProduct = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $readmeRoot 'product.json') | ConvertFrom-Json).name
New-Item -ItemType Directory -Force -Path $readmeAssets | Out-Null
New-Item -ItemType Directory -Force -Path $readmePreview | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;

public static class ReadmeArtwork {
    public const int Width = 1200;
    public const int Height = 624;
    static readonly Dictionary<string, Font> Fonts = new Dictionary<string, Font>();
    static Color C(string hex) { return ColorTranslator.FromHtml(hex); }
    static Font F(int size, bool bold = false, bool mono = false) {
        string key = size + ":" + bold + ":" + mono;
        if (!Fonts.ContainsKey(key)) Fonts[key] = new Font(mono ? "Consolas" : "Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
        return Fonts[key];
    }
    static void Text(Graphics g, string text, float x, float y, int size, string color, bool bold = false, bool mono = false) {
        using (var brush = new SolidBrush(C(color))) g.DrawString(text, F(size, bold, mono), brush, x, y, StringFormat.GenericTypographic);
    }
    static void Box(Graphics g, float x, float y, float w, float h, float radius, string fill, string stroke = null, float lineWidth = 1) {
        using (var p = new GraphicsPath()) {
            float d = radius * 2;
            p.AddArc(x, y, d, d, 180, 90); p.AddArc(x + w - d, y, d, d, 270, 90);
            p.AddArc(x + w - d, y + h - d, d, d, 0, 90); p.AddArc(x, y + h - d, d, d, 90, 90); p.CloseFigure();
            using (var brush = new SolidBrush(C(fill))) g.FillPath(brush, p);
            if (stroke != null) using (var pen = new Pen(C(stroke), lineWidth)) g.DrawPath(pen, p);
        }
    }
    static void Dot(Graphics g, float x, float y, float r, string color) {
        using (var brush = new SolidBrush(C(color))) g.FillEllipse(brush, x-r, y-r, 2*r, 2*r);
    }
    static void Segment(Graphics g, float x1, float y1, float x2, float y2, string color, float width = 1) {
        using (var pen = new Pen(C(color), width)) { pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; g.DrawLine(pen, x1, y1, x2, y2); }
    }
    static void Check(Graphics g, float x, float y, string color) {
        Segment(g, x, y+4, x+4, y+8, color, 1.8f); Segment(g, x+4, y+8, x+12, y, color, 1.8f);
    }
    public static Bitmap Draw(int frame, int count, string product) {
        var image = new Bitmap(Width, Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(image)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(C("#151b1d"));
            for (int x=30; x<Width; x+=24) for (int y=24; y<Height; y+=24) Dot(g,x,y,0.7f,"#253033");
            Box(g, 38, 30, 48, 48, 13, "#232b29", "#3c443d");
            Box(g, 47, 39, 13, 13, 3, "#232b29", "#c4a16b", 1.8f);
            Box(g, 64, 45, 13, 13, 3, "#232b29", "#c4a16b", 1.8f);
            Box(g, 51, 59, 13, 12, 3, "#232b29", "#c4a16b", 1.8f);
            Text(g, product, 102, 36, 27, "#f5f3ec", true);
            Text(g, "A LOCAL WORKSPACE FOR CODING AGENTS", 103, 69, 11, "#a6b2b0", true);
            Box(g, 957, 38, 204, 32, 16, "#202a2b", "#354244");
            Dot(g, 976, 54, 3, "#c4a16b");
            Text(g, "WORKFLOW ILLUSTRATION", 987, 46, 11, "#d1d9d4", true);

            Text(g, "Give your agents room to work.", 39, 112, 42, "#f5f3ec", true);
            Text(g, "One canvas for the plan, the code, the review and your next decision.", 42, 171, 19, "#afbbb8");

            Box(g, 38, 222, 1124, 325, 19, "#1a2326", "#344044");
            for (int x=58; x<1150; x+=22) for (int y=240; y<537; y+=22) Dot(g,x,y,0.65f,"#2c383b");
            Text(g, "CANVAS / EXAMPLE WORKFLOW", 62, 242, 11, "#93a5a2", true, true);
            Text(g, "Local tools. Explicit permissions. Reviewable work.", 757, 242, 13, "#93a5a2");

            double position = (double)frame / count * 4.0;
            int stage = Math.Min(3, (int)position);
            float progress = (float)(position - stage);
            float pulse = (float)(0.5 + 0.5 * Math.Sin(progress * Math.PI * 2));
            string[] colors = {"#d3b27e", "#6bb3ff", "#b8a0ef", "#78d4a4"};
            string[] muted = {"#3b342c", "#243545", "#322d42", "#253d34"};
            string[] titles = {"Define", "Build", "Review", "Accept"};
            string[] subtitles = {"A clear task brief", "An isolated worktree", "Independent evidence", "Your decision"};
            string[][] lines = {
                new[]{"Goal + criteria", "Dependencies", "Assigned agent"},
                new[]{"agent: Builder", "area: task/parser", "scope: explicit"},
                new[]{"Inspect the diff", "Declared checks", "Exact commit"},
                new[]{"Review the evidence", "Approve the result", "Integrate explicitly"}
            };
            string[] activeLabels = {"SETTING THE SCOPE", "WORK IN PROGRESS", "REVIEW IN PROGRESS", "WAITING FOR YOU"};
            string[] readyLabels = {"SCOPE DEFINED", "RESULT SUBMITTED", "EVIDENCE READY", "HUMAN APPROVAL"};
            for (int i=0; i<3; i++) {
                float x = 304 + i*276;
                Segment(g, x, 390, x+34, 390, stage>i ? colors[i] : "#455659", 1.5f);
                Segment(g, x+29, 386, x+34, 390, stage>i ? colors[i] : "#455659", 1.5f);
                Segment(g, x+29, 394, x+34, 390, stage>i ? colors[i] : "#455659", 1.5f);
                if (stage==i) Dot(g, x+3+27*progress, 390, 3, colors[i]);
            }
            for (int i=0; i<4; i++) {
                float x = 62 + i*276;
                bool active = stage==i;
                Box(g, x, 278, 242, 237, 13, "#202a2e", active ? colors[i] : "#3a484d", active ? 1.7f : 1);
                Box(g, x+15, 294, 31, 29, 8, muted[i]);
                Text(g, "0"+(i+1), x+22, 301, 12, colors[i], true, true);
                Text(g, titles[i], x+57, 294, 23, "#f1f4f0", true);
                Text(g, subtitles[i], x+16, 337, 15, "#aab9b6");
                Segment(g, x+16, 368, x+226, 368, "#354449");
                if (i==1) Box(g, x+14, 380, 214, 80, 7, "#182125");
                for (int line=0; line<3; line++) {
                    if (i==1) Text(g, lines[i][line], x+24, 389+line*21, 13, line==0 ? colors[i] : "#b5c3be", false, true);
                    else {
                        if (stage>i) Check(g, x+18, 390+line*23, colors[i]);
                        else Dot(g, x+23, 395+line*23, 2, "#697f7d");
                        Text(g, lines[i][line], x+38, 384+line*23, 14, "#c3ceca");
                    }
                }
                Box(g, x+15, 479, 212, 22, 6, active ? muted[i] : "#263237");
                Text(g, active ? activeLabels[i] : (stage>i ? readyLabels[i] : "READY WHEN NEEDED"), x+25, 484, 10, active || stage>i ? colors[i] : "#8fa29f", true);
                if (active && i!=3) {
                    Segment(g, x+17, 512, x+17+208*progress, 512, colors[i], 2);
                }
                if (active && i==3) Dot(g, x+218, 307, 3+pulse*1.2f, colors[i]);
            }
            Text(g, "REAL TERMINALS", 62, 575, 11, "#b5c2ba", true);
            Dot(g, 202, 583, 2, "#c4a16b");
            Text(g, "BOUNDED TEAM RUNS", 218, 575, 11, "#b5c2ba", true);
            Dot(g, 394, 583, 2, "#c4a16b");
            Text(g, "CONTROLLED INTEGRATION", 411, 575, 11, "#b5c2ba", true);
            Text(g, "Your agents. Your workspace. Your call.", 878, 574, 13, "#c4a16b");
        }
        return image;
    }
    // Preserve the native encoder's compressed images while writing timing,
    // looping and cropped-frame positions explicitly across Windows runtimes.
    public static void NormalizeAnimation(string path, int delay, Rectangle[] bounds) {
        byte[] source = File.ReadAllBytes(path);
        int position = 13;
        if ((source[10] & 128) != 0) position += 3 * (1 << ((source[10] & 7) + 1));
        using (var memory = new MemoryStream()) using (var writer = new BinaryWriter(memory)) {
            writer.Write(source, 0, position);
            writer.Write(new byte[]{33,255,11});
            writer.Write(System.Text.Encoding.ASCII.GetBytes("NETSCAPE2.0"));
            writer.Write(new byte[]{3,1,0,0,0});
            int frame = 0;
            while (position < source.Length && source[position] != 59) {
                if (source[position] == 33) {
                    position += 2;
                    while (source[position] != 0) position += source[position] + 1;
                    position++;
                    continue;
                }
                if (source[position] != 44 || frame >= bounds.Length) throw new InvalidDataException("Unexpected GIF image block");
                int start = position;
                int width = source[start+5] | (source[start+6] << 8);
                int height = source[start+7] | (source[start+8] << 8);
                Rectangle box = bounds[frame++];
                if (width != box.Width || height != box.Height) throw new InvalidDataException("GIF frame dimensions changed");
                int flags = source[position+9];
                position += 10;
                if ((flags & 128) != 0) position += 3 * (1 << ((flags & 7) + 1));
                position++;
                while (source[position] != 0) position += source[position] + 1;
                position++;
                byte[] block = new byte[position-start];
                Buffer.BlockCopy(source, start, block, 0, block.Length);
                block[1]=(byte)box.X; block[2]=(byte)(box.X >> 8);
                block[3]=(byte)box.Y; block[4]=(byte)(box.Y >> 8);
                writer.Write(new byte[]{33,249,4,4,(byte)delay,(byte)(delay >> 8),0,0});
                writer.Write(block);
            }
            if (frame != bounds.Length) throw new InvalidDataException("Missing animation frames");
            writer.Write((byte)59);
            File.WriteAllBytes(path, memory.ToArray());
        }
    }
    public static Rectangle Changes(Bitmap previous, Bitmap current) {
        var bounds = new Rectangle(0, 0, Width, Height);
        var p = previous.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var c = current.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try {
            int length = Math.Abs(p.Stride) * Height;
            byte[] left = new byte[length], right = new byte[length];
            Marshal.Copy(p.Scan0, left, 0, length); Marshal.Copy(c.Scan0, right, 0, length);
            int minX=Width, minY=Height, maxX=-1, maxY=-1;
            for (int y=0; y<Height; y++) for (int x=0; x<Width; x++) {
                int n=y*p.Stride+x*4;
                if (left[n]!=right[n] || left[n+1]!=right[n+1] || left[n+2]!=right[n+2]) {
                    minX=Math.Min(minX,x); maxX=Math.Max(maxX,x); minY=Math.Min(minY,y); maxY=Math.Max(maxY,y);
                }
            }
            if (maxX<0) return new Rectangle(0,0,1,1);
            minX=Math.Max(0,minX-2); minY=Math.Max(0,minY-2); maxX=Math.Min(Width-1,maxX+2); maxY=Math.Min(Height-1,maxY+2);
            return new Rectangle(minX,minY,maxX-minX+1,maxY-minY+1);
        } finally { previous.UnlockBits(p); current.UnlockBits(c); }
    }
}
'@ -ReferencedAssemblies System.Drawing

# A shared palette keeps the flat dark surfaces exact rather than dithering
# every frame independently. Intermediate tones retain antialiased lettering.
$readmePaletteColors = New-Object 'System.Collections.Generic.List[System.Windows.Media.Color]'
$readmeColorHexes = [regex]::Matches((Get-Content -Raw -LiteralPath $PSCommandPath), '#[0-9a-fA-F]{6}') |
    ForEach-Object { $_.Value } | Select-Object -Unique
foreach ($readmeHex in $readmeColorHexes) {
    $readmePaletteColors.Add([System.Windows.Media.ColorConverter]::ConvertFromString($readmeHex))
}
foreach ($readmeHex in $readmeColorHexes) {
    $readmeColor = [System.Windows.Media.ColorConverter]::ConvertFromString($readmeHex)
    foreach ($readmeShade in 1..4) {
        $readmeMix = $readmeShade / 5.0
        $readmeTone = [System.Windows.Media.Color]::FromRgb(
            [byte][Math]::Round(32 + ($readmeColor.R - 32) * $readmeMix),
            [byte][Math]::Round(42 + ($readmeColor.G - 42) * $readmeMix),
            [byte][Math]::Round(46 + ($readmeColor.B - 46) * $readmeMix))
        if ($readmePaletteColors.Count -lt 256 -and -not $readmePaletteColors.Contains($readmeTone)) {
            $readmePaletteColors.Add($readmeTone)
        }
    }
}
$readmePalette = New-Object System.Windows.Media.Imaging.BitmapPalette (,$readmePaletteColors)
$readmeEncoder = New-Object System.Windows.Media.Imaging.GifBitmapEncoder
$readmeRectangles = New-Object 'System.Collections.Generic.List[System.Drawing.Rectangle]'
$readmePrevious = $null
$readmeFrames = 96
try {
    for ($readmeFrame = 0; $readmeFrame -lt $readmeFrames; $readmeFrame++) {
        $readmeBitmap = [ReadmeArtwork]::Draw($readmeFrame, $readmeFrames, $readmeProduct)
        if ($readmeFrame -eq 70) {
            $readmeBitmap.Save((Join-Path $readmeAssets 'workflow.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        if ($readmeFrame -in @(5, 32, 58, 84)) {
            $readmeBitmap.Save((Join-Path $readmePreview "readme-stage-$readmeFrame.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        $readmeBounds = if ($null -eq $readmePrevious) {
            New-Object System.Drawing.Rectangle 0, 0, ([ReadmeArtwork]::Width), ([ReadmeArtwork]::Height)
        } else { [ReadmeArtwork]::Changes($readmePrevious, $readmeBitmap) }
        $readmeRectangles.Add($readmeBounds)
        $readmePatch = $readmeBitmap.Clone($readmeBounds, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $readmeMemory = New-Object System.IO.MemoryStream
        try {
            $readmePatch.Save($readmeMemory, [System.Drawing.Imaging.ImageFormat]::Png)
            $readmeMemory.Position = 0
            $readmeSource = New-Object System.Windows.Media.Imaging.BitmapImage
            $readmeSource.BeginInit()
            $readmeSource.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
            $readmeSource.StreamSource = $readmeMemory
            $readmeSource.EndInit()
            $readmeSource.Freeze()
            $readmeIndexed = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap
            $readmeIndexed.BeginInit()
            $readmeIndexed.Source = $readmeSource
            $readmeIndexed.DestinationFormat = [System.Windows.Media.PixelFormats]::Indexed8
            $readmeIndexed.DestinationPalette = $readmePalette
            $readmeIndexed.AlphaThreshold = 0.0
            $readmeIndexed.EndInit()
            if ($readmeIndexed.CanFreeze) { $readmeIndexed.Freeze() }
            $readmeMetadata = New-Object System.Windows.Media.Imaging.BitmapMetadata 'gif'
            $readmeMetadata.SetQuery('/grctlext/Delay', [uint16]12)
            $readmeMetadata.SetQuery('/grctlext/Disposal', [byte]1)
            $readmeMetadata.SetQuery('/imgdesc/Left', [uint16]$readmeBounds.X)
            $readmeMetadata.SetQuery('/imgdesc/Top', [uint16]$readmeBounds.Y)
            if ($readmeFrame -eq 0) {
                $readmeMetadata.SetQuery('/appext/Application', [System.Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0'))
                $readmeMetadata.SetQuery('/appext/Data', [byte[]]@(3, 1, 0, 0, 0))
            }
            $readmeEncoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($readmeIndexed, $null, $readmeMetadata, $null))
        } finally { $readmeMemory.Dispose(); $readmePatch.Dispose() }
        if ($null -ne $readmePrevious) { $readmePrevious.Dispose() }
        $readmePrevious = $readmeBitmap
    }
    $readmeFile = [System.IO.File]::Create((Join-Path $readmeAssets 'workflow.gif'))
    try { $readmeEncoder.Save($readmeFile) } finally { $readmeFile.Dispose() }
    [ReadmeArtwork]::NormalizeAnimation((Join-Path $readmeAssets 'workflow.gif'), 12, $readmeRectangles.ToArray())
} finally { if ($null -ne $readmePrevious) { $readmePrevious.Dispose() } }

Get-Item -LiteralPath (Join-Path $readmeAssets 'workflow.gif'), (Join-Path $readmeAssets 'workflow.png') |
    Select-Object Name, Length
