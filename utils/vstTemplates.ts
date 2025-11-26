

export const PLUGIN_PROCESSOR_H = `/*
  ==============================================================================
    PluginProcessor.h
    VEVI EQ PRO - Logic Header
    GitHub: https://github.com/vevikils/VeviMaster-IA
  ==============================================================================
*/
#pragma once
#include <JuceHeader.h>

class VeviEqProAudioProcessor  : public juce::AudioProcessor
{
public:
    VeviEqProAudioProcessor();
    ~VeviEqProAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // --- VEVI EQ SPECIFIC ---
    juce::AudioProcessorValueTreeState apvts;
    static const int NUM_BANDS = 7;

    using FilterBand = juce::dsp::IIR::Filter<float>;
    FilterBand* getLeftFilter(int bandIndex) { return leftFilters[bandIndex].get(); }

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    
    std::vector<std::unique_ptr<FilterBand>> leftFilters;
    std::vector<std::unique_ptr<FilterBand>> rightFilters;

    void updateFilters();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (VeviEqProAudioProcessor)
};
`;

export const PLUGIN_PROCESSOR_CPP = `/*
  ==============================================================================
    PluginProcessor.cpp
    VEVI EQ PRO - Logic Implementation
    GitHub: https://github.com/vevikils/VeviMaster-IA
  ==============================================================================
*/
#include "PluginProcessor.h"
#include "PluginEditor.h"

VeviEqProAudioProcessor::VeviEqProAudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
     : AudioProcessor (BusesProperties()
                     .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                     .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
#endif
       apvts (*this, nullptr, "Parameters", createParameterLayout())
{
    for (int i = 0; i < NUM_BANDS; ++i) {
        leftFilters.push_back(std::make_unique<FilterBand>());
        rightFilters.push_back(std::make_unique<FilterBand>());
    }
}

VeviEqProAudioProcessor::~VeviEqProAudioProcessor() {}

juce::AudioProcessorValueTreeState::ParameterLayout VeviEqProAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>("MasterGain", "Output", -12.0f, 12.0f, 0.0f));

    float defaultFreqs[] = { 60.f, 150.f, 400.f, 1000.f, 2500.f, 6000.f, 12000.f };

    for (int i = 0; i < NUM_BANDS; ++i)
    {
        auto prefix = "Band" + juce::String(i + 1);
        
        layout.add(std::make_unique<juce::AudioParameterFloat>(
            prefix + "Freq", prefix + " Freq", 
            juce::NormalisableRange<float>(20.0f, 20000.0f, 1.0f, 0.25f), defaultFreqs[i]));

        layout.add(std::make_unique<juce::AudioParameterFloat>(
            prefix + "Gain", prefix + " Gain", -30.0f, 30.0f, 0.0f));

        layout.add(std::make_unique<juce::AudioParameterFloat>(
            prefix + "Q", prefix + " Q", 0.1f, 10.0f, 4.0f));

        int defaultType = 0; 
        if (i == 0) defaultType = 1; 
        if (i == 6) defaultType = 2; 

        layout.add(std::make_unique<juce::AudioParameterChoice>(
            prefix + "Type", prefix + " Type", 
            juce::StringArray { "Peak", "LowShelf", "HighShelf" }, defaultType));
            
        layout.add(std::make_unique<juce::AudioParameterBool>(
            prefix + "Bypass", prefix + " Enabled", true));
    }
    return layout;
}

void VeviEqProAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = samplesPerBlock;
    spec.numChannels = getTotalNumOutputChannels();

    for (int i = 0; i < NUM_BANDS; ++i) {
        leftFilters[i]->prepare(spec);
        rightFilters[i]->prepare(spec);
        leftFilters[i]->reset();
        rightFilters[i]->reset();
    }
    updateFilters();
}

void VeviEqProAudioProcessor::releaseResources() {}

void VeviEqProAudioProcessor::updateFilters()
{
    double sampleRate = getSampleRate();
    if (sampleRate <= 0) return;

    for (int i = 0; i < NUM_BANDS; ++i)
    {
        auto prefix = "Band" + juce::String(i + 1);
        
        float freq = apvts.getRawParameterValue(prefix + "Freq")->load();
        float gainDb = apvts.getRawParameterValue(prefix + "Gain")->load();
        float q = apvts.getRawParameterValue(prefix + "Q")->load();
        int type = (int)apvts.getRawParameterValue(prefix + "Type")->load();
        bool enabled = apvts.getRawParameterValue(prefix + "Bypass")->load() > 0.5f;

        float gainLinear = juce::Decibels::decibelsToGain(gainDb);
        if (!enabled) gainLinear = 1.0f;

        auto coeffs = juce::dsp::IIR::Coefficients<float>::makePeakFilter(sampleRate, freq, q, gainLinear);

        if (type == 1) coeffs = juce::dsp::IIR::Coefficients<float>::makeLowShelf(sampleRate, freq, q, gainLinear);
        else if (type == 2) coeffs = juce::dsp::IIR::Coefficients<float>::makeHighShelf(sampleRate, freq, q, gainLinear);

        *leftFilters[i]->state = *coeffs;
        *rightFilters[i]->state = *coeffs;
    }
}

void VeviEqProAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    updateFilters();

    float outputGain = juce::Decibels::decibelsToGain(apvts.getRawParameterValue("MasterGain")->load());

    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    auto* leftData = buffer.getWritePointer(0);
    auto* rightData = (totalNumOutputChannels > 1) ? buffer.getWritePointer(1) : nullptr;
    
    int numSamples = buffer.getNumSamples();

    for (int s = 0; s < numSamples; ++s)
    {
        float l = leftData[s];
        float r = (rightData != nullptr) ? rightData[s] : l;

        for (int i = 0; i < NUM_BANDS; ++i) {
            l = leftFilters[i]->processSample(l);
            r = rightFilters[i]->processSample(r);
        }

        leftData[s] = l * outputGain;
        if (rightData) rightData[s] = r * outputGain;
    }
}

bool VeviEqProAudioProcessor::hasEditor() const { return true; }
juce::AudioProcessorEditor* VeviEqProAudioProcessor::createEditor() { return new VeviEqProAudioProcessorEditor (*this); }
const juce::String VeviEqProAudioProcessor::getName() const { return JucePlugin_Name; }
bool VeviEqProAudioProcessor::acceptsMidi() const { return false; }
bool VeviEqProAudioProcessor::producesMidi() const { return false; }
bool VeviEqProAudioProcessor::isMidiEffect() const { return false; }
double VeviEqProAudioProcessor::getTailLengthSeconds() const { return 0.0; }
int VeviEqProAudioProcessor::getNumPrograms() { return 1; }
int VeviEqProAudioProcessor::getCurrentProgram() { return 0; }
void VeviEqProAudioProcessor::setCurrentProgram (int index) {}
const juce::String VeviEqProAudioProcessor::getProgramName (int index) { return {}; }
void VeviEqProAudioProcessor::changeProgramName (int index, const juce::String& newName) {}
void VeviEqProAudioProcessor::getStateInformation (juce::MemoryBlock& destData) {
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml (state.createXml());
    copyXmlToBinary (*xml, destData);
}
void VeviEqProAudioProcessor::setStateInformation (const void* data, int sizeInBytes) {
    std::unique_ptr<juce::XmlElement> xmlState (getXmlFromBinary (data, sizeInBytes));
    if (xmlState.get() != nullptr)
        if (xmlState->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xmlState));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new VeviEqProAudioProcessor(); }
`;

export const PLUGIN_EDITOR_H = `/*
  ==============================================================================
    PluginEditor.h
    VEVI EQ PRO - UI Header
    GitHub: https://github.com/vevikils/VeviMaster-IA
  ==============================================================================
*/
#pragma once
#include <JuceHeader.h>
#include "PluginProcessor.h"

class VeviEqProAudioProcessorEditor  : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    VeviEqProAudioProcessorEditor (VeviEqProAudioProcessor&);
    ~VeviEqProAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void timerCallback() override;

private:
    VeviEqProAudioProcessor& audioProcessor;
    
    float getFreqForX(float x) const;
    float getXForFreq(float freq) const;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (VeviEqProAudioProcessorEditor)
};
`;

export const PLUGIN_EDITOR_CPP = `/*
  ==============================================================================
    PluginEditor.cpp
    VEVI EQ PRO - UI Implementation
    GitHub: https://github.com/vevikils/VeviMaster-IA
  ==============================================================================
*/
#include "PluginProcessor.h"
#include "PluginEditor.h"

VeviEqProAudioProcessorEditor::VeviEqProAudioProcessorEditor (VeviEqProAudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{
    setSize (800, 500);
    startTimerHz(30);
}

VeviEqProAudioProcessorEditor::~VeviEqProAudioProcessorEditor()
{
    stopTimer();
}

void VeviEqProAudioProcessorEditor::timerCallback()
{
    repaint();
}

float VeviEqProAudioProcessorEditor::getFreqForX(float x) const
{
    float normX = x / (float)getWidth();
    return 20.0f * std::pow(20000.0f / 20.0f, normX);
}

float VeviEqProAudioProcessorEditor::getXForFreq(float freq) const
{
    return (float)getWidth() * (std::log(freq / 20.0f) / std::log(20000.0f / 20.0f));
}

void VeviEqProAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour::fromString("ff020617")); 

    g.setColour(juce::Colour::fromString("ff1e293b"));
    for (float f : {60, 100, 200, 500, 1000, 2000, 5000, 10000}) {
        float x = getXForFreq(f);
        g.drawVerticalLine((int)x, 0.0f, (float)getHeight());
    }
    g.drawHorizontalLine(getHeight() / 2, 0.0f, (float)getWidth());

    juce::Path curve;
    bool started = false;

    for (int x = 0; x < getWidth(); x += 2)
    {
        float freq = getFreqForX((float)x);
        float mag = 1.0f;

        for (int i = 0; i < VeviEqProAudioProcessor::NUM_BANDS; ++i)
        {
            auto* filter = audioProcessor.getLeftFilter(i);
            if (filter) {
                mag *= filter->state->getMagnitudeForFrequency(freq, audioProcessor.getSampleRate());
            }
        }

        float db = juce::Decibels::gainToDecibels(mag);
        float y = juce::jmap(db, -30.0f, 30.0f, (float)getHeight(), 0.0f);

        if (!started) { curve.startNewSubPath((float)x, y); started = true; }
        else { curve.lineTo((float)x, y); }
    }

    g.setColour(juce::Colour::fromString("ff3b82f6"));
    g.strokePath(curve, juce::PathStrokeType(2.5f));

    g.setGradientFill(juce::ColourGradient(
        juce::Colour::fromString("443b82f6"), 0, (float)getHeight(),
        juce::Colour::fromString("003b82f6"), 0, 0, false));
    curve.lineTo((float)getWidth(), (float)getHeight());
    curve.lineTo(0.0f, (float)getHeight());
    curve.closeSubPath();
    g.fillPath(curve);
    
    g.setColour(juce::Colours::white);
    g.setFont(20.0f);
    g.drawText("VEVI EQ Pro", 20, 20, 200, 30, juce::Justification::left);
}

void VeviEqProAudioProcessorEditor::resized() {}
`;
